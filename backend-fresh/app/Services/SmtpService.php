<?php

namespace App\Services;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\OAuth;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * SMTP operations for email connections.
 * Supports both password-based authentication and OAuth2.
 */
class SmtpService
{
    private $accountId;

    /**
     * Test SMTP connection with given credentials.
     *
     * @param array $credentials {host, port, username, password, use_tls, use_ssl}
     * @throws RuntimeException on connection failure
     */
    public function testConnection(array $credentials): bool
    {
        $host = $credentials['host'] ?? '';
        $port = (int)($credentials['port'] ?? 587);
        $username = $credentials['username'] ?? '';
        $password = $credentials['password'] ?? '';
        $useTls = $credentials['use_tls'] ?? true;
        $useSsl = $credentials['use_ssl'] ?? false;

        if (!$host || !$username || !$password) {
            throw new RuntimeException('SMTP_MISSING_CREDENTIALS');
        }

        $mail = new PHPMailer(true);

        try {
            // Enable debug output
            $mail->SMTPDebug = 2;
            $mail->Debugoutput = function ($msg) {
                Log::debug('PHPMAILER_DEBUG', ['message' => trim($msg)]);
            };

            $this->configureMailer($mail, $host, $port, $useTls, $useSsl);

            // Auth with password
            $mail->AuthType = 'LOGIN';
            $mail->Username = $username;
            $mail->Password = $password;

            Log::debug('SMTP_TEST_ATTEMPT', [
                'host' => $host,
                'port' => $port,
                'username' => $username,
                'use_tls' => $useTls,
                'use_ssl' => $useSsl,
            ]);

            // Just test the connection — don't send anything
            if (!$mail->smtpConnect()) {
                throw new RuntimeException('SMTP connection failed: ' . $mail->ErrorInfo);
            }

            $mail->smtpClose();
            return true;
        } catch (PHPMailerException $e) {
            Log::error('PHPMAILER_TEST_ERROR', [
                'error' => $e->getMessage(),
                'code' => $e->getCode(),
            ]);
            throw new RuntimeException('SMTP_TEST_FAILED: ' . $e->getMessage());
        } catch (\Exception $e) {
            Log::error('SMTP_TEST_ERROR', [
                'error' => $e->getMessage(),
            ]);
            throw new RuntimeException('SMTP_TEST_FAILED: ' . $e->getMessage());
        }
    }

    /**
     * Send email via SMTP with password authentication
     */
    public function send(
        array $credentials,
        string $from,
        string $fromName,
        array $to,
        array $cc,
        array $bcc,
        string $subject,
        string $body,
        bool $isHtml = true,
        int $accountId = null,
        array $campaignSettings = []
    ): bool {
        $this->accountId = $accountId;

        $host = $credentials['host'] ?? '';
        $port = (int)($credentials['port'] ?? 587);
        $username = $credentials['username'] ?? '';
        $password = $credentials['password'] ?? '';
        $useTls = $credentials['use_tls'] ?? true;
        $useSsl = $credentials['use_ssl'] ?? false;

        $this->log('SMTP_SEND_START', [
            'host' => $host,
            'port' => $port,
            'from' => $from,
            'recipients' => count($to) + count($cc) + count($bcc),
        ]);

        if (!$host || !$username || !$password) {
            throw new RuntimeException('SMTP_MISSING_CREDENTIALS');
        }

        $mail = new PHPMailer(true);

        try {
            // Configure SMTP
            $this->configureMailer($mail, $host, $port, $useTls, $useSsl);

            // Password authentication
            $mail->AuthType = 'LOGIN';
            $mail->Username = $username;
            $mail->Password = $password;

            // Set sender
            $mail->setFrom($from, $fromName);

            // Set recipients
            foreach ($to as $email => $name) {
                $mail->addAddress($email, $name);
            }

            foreach ($cc as $email => $name) {
                $mail->addCC($email, $name);
            }

            foreach ($bcc as $email => $name) {
                $mail->addBCC($email, $name);
            }

            // Get CAN-SPAM compliance settings
            $unsubscribeLink = \DB::table('settings')->where('key', 'email_unsubscribe_link')->value('value');
            $unsubscribeText = \DB::table('settings')->where('key', 'email_unsubscribe_text')->value('value') ?? 'Unsubscribe';
            $physicalAddress = \DB::table('settings')->where('key', 'email_physical_address')->value('value');

            // Add footer to email body
            $emailFooter = '<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">';
            if ($unsubscribeLink) {
                $emailFooter .= '<p><a href="'.$unsubscribeLink.'" style="color: #0066cc; text-decoration: none;">'.$unsubscribeText.'</a></p>';
            }
            if ($physicalAddress) {
                $emailFooter .= '<p>'.nl2br(htmlspecialchars($physicalAddress)).'</p>';
            }
            $emailFooter .= '</div>';

            // Set message with footer
            $mail->Subject = $subject;
            $mail->Body = $body . $emailFooter;
            $mail->AltBody = strip_tags($body) . "\n\n" . strip_tags($emailFooter);
            $mail->isHTML($isHtml);

            // ===== ENHANCED DELIVERABILITY HEADERS =====
            // These headers improve inbox placement and sender reputation

            // 1. Standard headers
            $mail->addCustomHeader('X-Mailer', 'Forward Mail System/1.0');
            $mail->addCustomHeader('MIME-Version', '1.0');

            // 2. Priority/Importance headers
            $isImportant = !empty($campaignSettings['markAsImportant']);
            $priority = $isImportant ? '1' : '3';
            $importance = $isImportant ? 'High' : 'Normal';
            $mail->addCustomHeader('X-Priority', $priority);
            $mail->addCustomHeader('Importance', $importance);

            // 3. SPF/DKIM/DMARC alignment
            $mail->Sender = $from; // Sets Return-Path
            $domain = substr(strrchr($from, "@"), 1);
            $mail->addCustomHeader('From', $fromName ? "$fromName <$from>" : $from);

            // 4. Proper Message-ID (RFC 5322 compliant)
            $timestamp = time();
            $randomString = bin2hex(random_bytes(8));
            $messageId = "<{$timestamp}.{$randomString}@{$domain}>";
            $mail->MessageID = $messageId;

            // 5. List headers (for compliance and filtering)
            $unsubHeader = $unsubscribeLink ? '<'.$unsubscribeLink.'>' : '<mailto:unsubscribe@'.$domain.'>';
            $mail->addCustomHeader('List-Unsubscribe', $unsubHeader);
            $mail->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');

            // 6. Authentication headers hint
            $mail->addCustomHeader('X-Mailer-Version', 'Forward/1.0');
            $mail->addCustomHeader('X-Originating-IP', '[' . $this->getServerIP() . ']');

            // 7. Date header (ensures proper timestamp)
            $mail->addCustomHeader('Date', date('r'));

            // 8. Content headers
            $mail->addCustomHeader('Content-Type', 'text/html; charset=UTF-8');
            $mail->addCustomHeader('Content-Transfer-Encoding', '7bit');

            // Send
            if (!$mail->send()) {
                throw new RuntimeException('Failed to send email: ' . $mail->ErrorInfo);
            }

            $this->log('SMTP_SEND_SUCCESS', [
                'from' => $from,
                'recipients' => count($to) + count($cc) + count($bcc),
                'campaign_settings' => $campaignSettings,
            ]);

            return true;
        } catch (PHPMailerException $e) {
            $this->log('SMTP_SEND_FAILED', ['error' => $e->getMessage()]);
            throw new RuntimeException("SMTP_SEND_FAILED: " . $e->getMessage());
        } catch (\Exception $e) {
            $this->log('SMTP_SEND_FAILED', ['error' => $e->getMessage()]);
            throw new RuntimeException("SMTP_SEND_FAILED: " . $e->getMessage());
        }
    }

    /**
     * Send email via SMTP with OAuth2 authentication (XOAUTH2)
     * Uses PHPMailer's proper OAuth2 flow with automatic token refresh
     *
     * @param string $from Email address
     * @param string $fromName Display name
     * @param array $to Recipients [email => name]
     * @param array $cc CC recipients
     * @param array $bcc BCC recipients
     * @param string $subject Email subject
     * @param string $body Email body
     * @param string $clientId OAuth client ID
     * @param string $clientSecret OAuth client secret
     * @param string $refreshToken OAuth refresh token
     * @param bool $isHtml Is HTML email
     * @param int $accountId Account ID for logging
     */
    public function sendViaOAuth(
        string $from,
        string $fromName,
        array $to,
        array $cc,
        array $bcc,
        string $subject,
        string $body,
        string $clientId,
        string $clientSecret,
        string $refreshToken,
        bool $isHtml = true,
        int $accountId = null,
        array $campaignSettings = []
    ): bool {
        $this->accountId = $accountId;

        $this->log('SMTP_OAUTH_SEND_START', [
            'from' => $from,
            'recipients' => count($to) + count($cc) + count($bcc),
            'provider' => 'Azure',
        ]);

        $mail = new PHPMailer(true);

        try {
            // Configure SMTP for Office 365
            $mail->isSMTP();
            $mail->Host = 'smtp.office365.com';
            $mail->Port = 587;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->SMTPAuth = true;
            $mail->AuthType = 'XOAUTH2';

            // Configure OAuth2 with proper Azure provider
            // This handles automatic token refresh!
            $provider = new OAuth();
            $provider->setProvider('Azure');

            // Set OAuth credentials for automatic token refresh
            $provider->setClientId($clientId);
            $provider->setClientSecret($clientSecret);
            $provider->setRefreshToken($refreshToken);
            $provider->setUsername($from);

            // Attach OAuth provider to mailer
            $mail->setOAuth($provider);

            // Set sender
            $mail->setFrom($from, $fromName);

            // Set recipients
            foreach ($to as $email => $name) {
                $mail->addAddress($email, $name);
            }

            foreach ($cc as $email => $name) {
                $mail->addCC($email, $name);
            }

            foreach ($bcc as $email => $name) {
                $mail->addBCC($email, $name);
            }

            // Get CAN-SPAM compliance settings
            $unsubscribeLink = \DB::table('settings')->where('key', 'email_unsubscribe_link')->value('value');
            $unsubscribeText = \DB::table('settings')->where('key', 'email_unsubscribe_text')->value('value') ?? 'Unsubscribe';
            $physicalAddress = \DB::table('settings')->where('key', 'email_physical_address')->value('value');

            // Add footer to email body
            $emailFooter = '<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">';
            if ($unsubscribeLink) {
                $emailFooter .= '<p><a href="'.$unsubscribeLink.'" style="color: #0066cc; text-decoration: none;">'.$unsubscribeText.'</a></p>';
            }
            if ($physicalAddress) {
                $emailFooter .= '<p>'.nl2br(htmlspecialchars($physicalAddress)).'</p>';
            }
            $emailFooter .= '</div>';

            // Set message with footer
            $mail->Subject = $subject;
            $mail->Body = $body . $emailFooter;
            $mail->AltBody = strip_tags($body) . "\n\n" . strip_tags($emailFooter);
            $mail->isHTML($isHtml);

            // Add headers to improve deliverability and avoid spam filters
            $mail->addCustomHeader('X-Mailer', 'Forward Mail System');

            // Handle importance/priority based on campaign settings
            $isImportant = !empty($campaignSettings['markAsImportant']);
            $priority = $isImportant ? '1' : '3';
            $importance = $isImportant ? 'High' : 'Normal';

            $mail->addCustomHeader('X-Priority', $priority);
            $mail->addCustomHeader('Importance', $importance);

            // Set Return-Path (helps with SPF/DKIM)
            $mail->Sender = $from;

            // Generate proper Message-ID
            $domain = substr(strrchr($from, "@"), 1);
            $timestamp = time();
            $randomString = base64_encode(random_bytes(16));
            $messageId = "<" . $timestamp . "." . $randomString . "@" . $domain . ">";
            $mail->MessageID = $messageId;

            // Add List-Unsubscribe header
            $unsubHeader = $unsubscribeLink ? '<'.$unsubscribeLink.'>' : '<mailto:unsubscribe@'.$domain.'>';
            $mail->addCustomHeader('List-Unsubscribe', $unsubHeader);
            $mail->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');

            // Enable debug logging
            $mail->SMTPDebug = 0; // Set to 2 for detailed debug
            $mail->Debugoutput = function ($msg) {
                $this->log('PHPMAILER_OAUTH_DEBUG', ['message' => trim($msg)]);
            };

            // Send email
            if (!$mail->send()) {
                throw new RuntimeException('Failed to send email: ' . $mail->ErrorInfo);
            }

            $this->log('SMTP_OAUTH_SEND_SUCCESS', [
                'from' => $from,
                'recipients' => count($to) + count($cc) + count($bcc),
                'campaign_settings' => $campaignSettings,
            ]);

            return true;
        } catch (PHPMailerException $e) {
            $this->log('SMTP_OAUTH_SEND_FAILED', ['error' => $e->getMessage()]);
            throw new RuntimeException("SMTP_OAUTH_SEND_FAILED: " . $e->getMessage());
        } catch (\Exception $e) {
            $this->log('SMTP_OAUTH_SEND_FAILED', ['error' => $e->getMessage()]);
            throw new RuntimeException("SMTP_OAUTH_SEND_FAILED: " . $e->getMessage());
        }
    }

    /**
     * Configure PHPMailer with common SMTP settings
     */
    private function configureMailer(PHPMailer $mail, string $host, int $port, bool $useTls, bool $useSsl): void
    {
        $mail->isSMTP();
        $mail->Host = $host;
        $mail->Port = $port;
        $mail->SMTPAuth = true;

        if ($useSsl) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($useTls) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $mail->SMTPSecure = '';
        }

        // Security settings
        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true,
            ]
        ];

        // Timeouts
        $mail->Timeout = 15;
        $mail->SMTPKeepAlive = true;

        // Error handling
        $mail->Debugoutput = function ($msg) {
            $this->log('PHPMAILER_DEBUG', ['message' => trim($msg)]);
        };
    }

    private function log(string $action, array $data = [])
    {
        Log::debug("SMTP_{$action}", array_merge($data, [
            'account_id' => $this->accountId,
        ]));
    }

    /**
     * Get server IP address for email headers
     */
    private function getServerIP(): string
    {
        if (!empty($_SERVER['SERVER_ADDR'])) {
            return $_SERVER['SERVER_ADDR'];
        }
        if (!empty($_SERVER['LOCAL_ADDR'])) {
            return $_SERVER['LOCAL_ADDR'];
        }
        return gethostbyname(gethostname()) ?? '127.0.0.1';
    }
}
