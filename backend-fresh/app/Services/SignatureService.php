<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Signature Service
 *
 * Fetches and manages email signatures from Microsoft Graph API
 */
class SignatureService
{
    /**
     * Get account signature from Microsoft Graph
     *
     * Endpoint: GET /me/mailboxSettings
     * Returns: signature (plain text or HTML)
     */
    public static function getSignature($accessToken)
    {
        if (!$accessToken) {
            return null;
        }

        try {
            $response = Http::withToken($accessToken)
                ->timeout(10)
                ->get('https://graph.microsoft.com/v1.0/me/mailboxSettings', [
                    '$select' => 'signature'
                ]);

            if ($response->successful()) {
                $data = $response->json();
                return $data['signature'] ?? null;
            }

            Log::warning('Failed to fetch signature from Graph API', [
                'status' => $response->status(),
                'body' => $response->body()
            ]);

            return null;
        } catch (\Exception $e) {
            Log::error('Error fetching signature: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Format signature for email
     * Wraps signature in HTML div with styling
     */
    public static function formatSignature($signature, $accountEmail = null)
    {
        if (!$signature) {
            return '';
        }

        // If signature is plain text, convert to HTML
        $signatureHtml = $signature;
        if (!str_contains($signature, '<')) {
            $signatureHtml = '<p>' . nl2br(htmlspecialchars($signature)) . '</p>';
        }

        return <<<HTML
<div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 16px; font-size: 12px; color: #666;">
    $signatureHtml
</div>
HTML;
    }

    /**
     * Append signature to email body
     */
    public static function appendSignatureToBody($emailBody, $signature)
    {
        if (!$signature) {
            return $emailBody;
        }

        // Check if body is HTML or plain text
        if (str_contains($emailBody, '<')) {
            // HTML body - append before closing body tag
            $formattedSig = self::formatSignature($signature);
            return str_replace('</body>', $formattedSig . '</body>', $emailBody);
        } else {
            // Plain text - just append with line break
            return $emailBody . "\n\n---\n" . $signature;
        }
    }
}
