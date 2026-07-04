<?php

namespace App\Http\Controllers;

use App\Services\DeliveryTrackerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    public function __construct(
        private DeliveryTrackerService $deliveryTracker,
    ) {}

    /**
     * Handle delivery notifications from various sources
     */
    public function handleDeliveryNotification(Request $request): JsonResponse
    {
        $source = $request->query('source', 'unknown');

        try {
            match ($source) {
                'microsoft' => $this->handleMicrosoftNotification($request),
                'smtp' => $this->handleSMTPNotification($request),
                default => Log::warning("Unknown webhook source: {$source}"),
            };

            return response()->json(['status' => 'received']);
        } catch (\Exception $e) {
            Log::error("Webhook processing error: {$e->getMessage()}");
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Handle Microsoft Graph delivery notifications
     */
    private function handleMicrosoftNotification(Request $request): void
    {
        $validationToken = $request->query('validationToken');
        if ($validationToken) {
            Log::info("Webhook validation request received");
            // Send validation token back immediately
            response($validationToken)->send();
            exit;
        }

        $data = $request->json()->all();

        if (is_array($data) && isset($data['value'])) {
            foreach ($data['value'] as $notification) {
                $this->deliveryTracker->parseGraphNotification($notification);
            }
        }
    }

    /**
     * Handle SMTP delivery status notifications
     */
    private function handleSMTPNotification(Request $request): void
    {
        $event = $request->input('event');
        $email = $request->input('email');
        $reason = $request->input('reason');
        $errorCode = $request->input('error_code');

        match ($event) {
            'bounce' => $this->deliveryTracker->handleBounce($email, 'soft', $reason),
            'hard_bounce' => $this->deliveryTracker->handleBounce($email, 'hard', $reason),
            'complaint' => $this->deliveryTracker->handleComplaint($email, $reason),
            'delivery' => $this->deliveryTracker->handleDeliverySuccess($email),
            'failure' => $this->deliveryTracker->handleDeliveryFailure($email, $reason, $errorCode),
            default => Log::warning("Unknown SMTP event: {$event}"),
        };
    }

    /**
     * Simulate bounce for testing
     */
    public function simulateBounce(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'bounce_type' => 'required|in:soft,hard',
            'reason' => 'nullable|string',
        ]);

        $this->deliveryTracker->handleBounce(
            $validated['email'],
            $validated['bounce_type'],
            $validated['reason'] ?? 'Test bounce'
        );

        return response()->json(['message' => 'Bounce simulated']);
    }

    /**
     * Simulate complaint for testing
     */
    public function simulateComplaint(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'reason' => 'nullable|string',
        ]);

        $this->deliveryTracker->handleComplaint(
            $validated['email'],
            $validated['reason'] ?? 'User marked as spam'
        );

        return response()->json(['message' => 'Complaint simulated']);
    }
}
