<?php

namespace App\Http\Controllers;

use App\Services\BounceComplaintTrackerService;
use App\Models\ConnectedAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Email Delivery Webhook Handler
 *
 * Handles bounce and complaint notifications from email providers:
 * - SendGrid
 * - Mailgun
 * - AWS SES
 * - Microsoft Graph (via polling/webhooks)
 */
class DeliveryWebhookController extends Controller
{
    public function __construct(
        private BounceComplaintTrackerService $tracker,
    ) {}

    /**
     * POST /api/webhooks/sendgrid
     * Handle SendGrid webhook events (bounces, complaints, etc)
     */
    public function sendgrid(Request $request): JsonResponse
    {
        try {
            // Verify webhook authenticity (optional but recommended)
            // See: https://docs.sendgrid.com/for-developers/tracking-events/webhook-overview

            $events = $request->input('event', []);
            if (!is_array($events)) {
                $events = [$events];
            }

            foreach ($events as $event) {
                $email = $event['email'] ?? null;
                $eventType = $event['event'] ?? null;

                if (!$email || !$eventType) continue;

                switch ($eventType) {
                    case 'bounce':
                        $reason = $event['bounce_type'] ?? 'unknown';
                        $bounceType = ($reason === 'permanent') ? 'hard' : 'soft';
                        $this->recordBounce($email, $bounceType, $reason);
                        break;

                    case 'dropped':
                        // Treat dropped as hard bounce
                        $this->recordBounce($email, 'hard', $event['reason'] ?? 'dropped');
                        break;

                    case 'complaint':
                        $this->recordComplaint($email, 'sendgrid');
                        break;

                    case 'spamreport':
                        $this->recordComplaint($email, 'sendgrid_report');
                        break;
                }
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('SendGrid webhook error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Webhook processing failed'], 500);
        }
    }

    /**
     * POST /api/webhooks/mailgun
     * Handle Mailgun webhook events
     */
    public function mailgun(Request $request): JsonResponse
    {
        try {
            // Mailgun sends 'event-data' as the event
            $eventData = $request->input('event-data', []);
            $eventType = $eventData['event'] ?? null;
            $email = $eventData['recipient'] ?? null;

            if (!$email || !$eventType) {
                return response()->json(['success' => false], 400);
            }

            switch ($eventType) {
                case 'bounced':
                    $bounceCode = $eventData['severity'] ?? '';
                    $bounceType = ($bounceCode === 'permanent') ? 'hard' : 'soft';
                    $this->recordBounce($email, $bounceType, $eventData['notification'] ?? 'bounced');
                    break;

                case 'complained':
                    $this->recordComplaint($email, 'mailgun');
                    break;

                case 'unsubscribed':
                    // Could suppress unsubscribed users too if desired
                    break;
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('Mailgun webhook error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Webhook processing failed'], 500);
        }
    }

    /**
     * POST /api/webhooks/aws-ses
     * Handle AWS SES bounce and complaint notifications
     */
    public function awsSes(Request $request): JsonResponse
    {
        try {
            $body = $request->getContent();
            $message = json_decode($body, true);

            // SES sends via SNS, verify signature if needed
            // See: https://docs.aws.amazon.com/ses/latest/dg/event-publishing.html

            $messageType = $message['Type'] ?? null;
            $content = json_decode($message['Message'] ?? '{}', true);
            $eventType = $content['eventType'] ?? null;

            if (!$eventType) {
                return response()->json(['success' => true]); // Still return 200
            }

            if ($eventType === 'Bounce') {
                $bounce = $content['bounce'] ?? [];
                $bounceType = ($bounce['bounceType'] === 'Permanent') ? 'hard' : 'soft';
                $reason = $bounce['bounceSubType'] ?? 'unknown';

                foreach ($bounce['bouncedRecipients'] ?? [] as $recipient) {
                    $this->recordBounce(
                        $recipient['emailAddress'],
                        $bounceType,
                        $reason
                    );
                }
            }

            if ($eventType === 'Complaint') {
                $complaint = $content['complaint'] ?? [];
                foreach ($complaint['complainedRecipients'] ?? [] as $recipient) {
                    $this->recordComplaint($recipient['emailAddress'], 'aws_ses');
                }
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('AWS SES webhook error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Webhook processing failed'], 500);
        }
    }

    /**
     * POST /api/webhooks/microsoft
     * Handle Microsoft Graph bounce/complaint notifications
     */
    public function microsoft(Request $request): JsonResponse
    {
        try {
            // Microsoft sends notifications via subscriptions
            // This would integrate with Microsoft Graph webhooks

            $notifications = $request->input('value', []);

            foreach ($notifications as $notification) {
                $changeType = $notification['changeType'] ?? null;
                $resourceData = $notification['resourceData'] ?? [];

                // Check mail delivery reports
                // In real scenario, would query Graph API for details
                // For now, this is a placeholder for Microsoft integration

                Log::info('Microsoft webhook received', ['changeType' => $changeType]);
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('Microsoft webhook error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Webhook processing failed'], 500);
        }
    }

    /**
     * POST /api/webhooks/generic
     * Handle generic bounce/complaint reports from any provider
     */
    public function generic(Request $request): JsonResponse
    {
        try {
            $email = $request->input('email');
            $type = $request->input('type'); // 'bounce' or 'complaint'
            $bounceType = $request->input('bounce_type', 'soft'); // 'hard' or 'soft'
            $reason = $request->input('reason', 'unknown');
            $accountId = $request->input('account_id');

            if (!$email || !$type) {
                return response()->json(['error' => 'Missing email or type'], 400);
            }

            if ($type === 'bounce') {
                $this->recordBounce($email, $bounceType, $reason, $accountId);
            } elseif ($type === 'complaint') {
                $this->recordComplaint($email, 'custom', $accountId);
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('Generic webhook error', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Webhook processing failed'], 500);
        }
    }

    /**
     * Record a bounce (attempts to find account from email if not provided)
     */
    private function recordBounce(string $email, string $type, string $reason, ?int $accountId = null): void
    {
        // If accountId not provided, try to find account by email
        if (!$accountId) {
            $account = ConnectedAccount::where('email', $email)->first();
            $accountId = $account?->id;
        }

        if (!$accountId) {
            Log::warning('Could not find account for bounce', ['email' => $email]);
            return;
        }

        $this->tracker->recordBounce($accountId, $email, $type, $reason);
    }

    /**
     * Record a complaint (attempts to find account from email if not provided)
     */
    private function recordComplaint(string $email, string $source, ?int $accountId = null): void
    {
        // If accountId not provided, try to find account by email
        if (!$accountId) {
            $account = ConnectedAccount::where('email', $email)->first();
            $accountId = $account?->id;
        }

        if (!$accountId) {
            Log::warning('Could not find account for complaint', ['email' => $email]);
            return;
        }

        $this->tracker->recordComplaint($accountId, $email, $source);
    }
}
