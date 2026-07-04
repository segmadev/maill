<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Email Health Checker Service
 *
 * Analyzes email content and sender metrics to predict inbox placement.
 * Helps users understand if their email is likely to reach inbox or spam.
 */
class EmailHealthCheckerService
{
    private $score = 100;
    private $issues = [];
    private $warnings = [];

    /**
     * Check email health before sending
     *
     * @param string $senderEmail From email address
     * @param string $subject Email subject line
     * @param string $body Email body/content
     * @param string $domain Sending domain
     * @param int $accountId Account ID for reputation check
     * @return array Health report with score and recommendations
     */
    public function checkEmailHealth(
        string $senderEmail,
        string $subject,
        string $body,
        string $domain = null,
        int $accountId = null
    ): array {
        $this->score = 100;
        $this->issues = [];
        $this->warnings = [];

        if (!$domain) {
            $domain = substr(strrchr($senderEmail, "@"), 1);
        }

        // Run all checks
        $this->checkSenderReputation($accountId);
        $this->checkDomainHealth($domain);
        $this->checkSubjectLine($subject);
        $this->checkEmailContent($body);
        $this->checkAuthentication($senderEmail, $domain);
        $this->checkCANSPAMCompliance();

        return [
            'score' => max(0, $this->score),
            'rating' => $this->getHealthRating(),
            'issues' => $this->issues,
            'warnings' => $this->warnings,
            'recommendations' => $this->getRecommendations(),
            'estimated_inbox_rate' => $this->estimateInboxRate(),
        ];
    }

    /**
     * Check sender reputation based on historical metrics
     */
    private function checkSenderReputation(?int $accountId): void
    {
        if (!$accountId) return;

        $bounceRate = Cache::get("account:{$accountId}:bounce_rate", 0);
        $complaintRate = Cache::get("account:{$accountId}:complaint_rate", 0);
        $engagementRate = Cache::get("account:{$accountId}:engagement_rate", 50);

        // High bounce rate (>5%) = major issue
        if ($bounceRate > 5) {
            $this->score -= 25;
            $this->issues[] = [
                'type' => 'high_bounce_rate',
                'message' => "Bounce rate is {$bounceRate}%. Remove invalid emails to improve reputation.",
                'severity' => 'critical',
            ];
        } elseif ($bounceRate > 2) {
            $this->score -= 10;
            $this->warnings[] = [
                'type' => 'moderate_bounce_rate',
                'message' => "Bounce rate is {$bounceRate}%. Consider list cleaning.",
            ];
        }

        // High complaint rate (>0.1%) = major issue
        if ($complaintRate > 0.5) {
            $this->score -= 30;
            $this->issues[] = [
                'type' => 'high_complaint_rate',
                'message' => "Complaint rate is {$complaintRate}%. Users are marking emails as spam.",
                'severity' => 'critical',
            ];
        } elseif ($complaintRate > 0.1) {
            $this->score -= 15;
            $this->warnings[] = [
                'type' => 'moderate_complaint_rate',
                'message' => "Users marking emails as spam. Review content quality.",
            ];
        }

        // Low engagement = warning
        if ($engagementRate < 20) {
            $this->warnings[] = [
                'type' => 'low_engagement',
                'message' => "Low engagement rate ({$engagementRate}%). Improve content relevance.",
            ];
        }
    }

    /**
     * Check domain health (SPF, DKIM, DMARC setup)
     */
    private function checkDomainHealth(string $domain): void
    {
        $spfRecord = $this->checkSPF($domain);
        $dkimRecord = $this->checkDKIM($domain);
        $dmarcRecord = $this->checkDMARC($domain);

        if (!$spfRecord) {
            $this->score -= 20;
            $this->issues[] = [
                'type' => 'missing_spf',
                'message' => "SPF record not found for {$domain}. Required for authentication.",
                'severity' => 'critical',
            ];
        } elseif (!$spfRecord['valid']) {
            $this->score -= 10;
            $this->warnings[] = [
                'type' => 'invalid_spf',
                'message' => 'SPF record exists but may be incomplete.',
            ];
        }

        if (!$dkimRecord) {
            $this->score -= 15;
            $this->warnings[] = [
                'type' => 'missing_dkim',
                'message' => "DKIM not configured for {$domain}. Improves deliverability.",
            ];
        }

        if (!$dmarcRecord) {
            $this->score -= 10;
            $this->warnings[] = [
                'type' => 'missing_dmarc',
                'message' => "DMARC policy not set for {$domain}. Helps prevent spoofing.",
            ];
        }
    }

    /**
     * Analyze subject line for spam triggers
     */
    private function checkSubjectLine(string $subject): void
    {
        if (empty($subject)) {
            $this->score -= 20;
            $this->issues[] = [
                'type' => 'empty_subject',
                'message' => 'Empty subject line. Always include a meaningful subject.',
                'severity' => 'critical',
            ];
            return;
        }

        $issues = 0;

        // All caps (spam trigger)
        if (strtoupper($subject) === $subject && strlen($subject) > 5) {
            $issues++;
            $this->warnings[] = [
                'type' => 'all_caps_subject',
                'message' => 'Subject in all caps. Use normal capitalization.',
            ];
        }

        // Too many exclamation marks
        if (substr_count($subject, '!') > 2) {
            $issues++;
            $this->warnings[] = [
                'type' => 'excessive_punctuation',
                'message' => 'Too many exclamation marks. Reduce to improve professionalism.',
            ];
        }

        // Spam trigger words
        $spamWords = ['FREE', 'CLICK HERE', 'LIMITED TIME', 'URGENT', 'ACT NOW', 'WINNER', 'CONGRATULATIONS'];
        foreach ($spamWords as $word) {
            if (stripos($subject, $word) !== false) {
                $issues++;
                break;
            }
        }

        if ($issues > 0) {
            $this->score -= 10;
            $this->warnings[] = [
                'type' => 'spam_trigger_words',
                'message' => 'Subject contains common spam keywords. Use professional language.',
            ];
        }

        // Subject too long
        if (strlen($subject) > 100) {
            $this->score -= 5;
            $this->warnings[] = [
                'type' => 'long_subject',
                'message' => 'Subject line is very long. Keep under 50 characters for best results.',
            ];
        }
    }

    /**
     * Analyze email content for spam triggers
     */
    private function checkEmailContent(string $body): void
    {
        if (empty($body)) {
            $this->score -= 15;
            $this->issues[] = [
                'type' => 'empty_body',
                'message' => 'Email body is empty.',
                'severity' => 'critical',
            ];
            return;
        }

        $issues = 0;

        // Only images (no text)
        $textContent = strip_tags($body);
        if (strlen(trim($textContent)) < 20) {
            $this->score -= 20;
            $this->issues[] = [
                'type' => 'image_only_email',
                'message' => 'Email contains mostly images. Add text content for better deliverability.',
                'severity' => 'critical',
            ];
            return;
        }

        // Check for spam trigger phrases
        $spamPhrases = [
            'click here' => 2,
            'buy now' => 3,
            'limited offer' => 2,
            'act now' => 2,
            'verify account' => 3, // Phishing trigger
            'confirm identity' => 3,
        ];

        $bodyLower = strtolower($body);
        foreach ($spamPhrases as $phrase => $penalty) {
            if (substr_count($bodyLower, $phrase) >= 2) {
                $this->score -= $penalty;
                $issues++;
            }
        }

        if ($issues > 0) {
            $this->warnings[] = [
                'type' => 'spam_phrases',
                'message' => 'Email contains repetitive spam-trigger phrases. Improve content quality.',
            ];
        }

        // Check for excessive links
        preg_match_all('/<a\s+(?:[^>]*?\s+)?href/i', $body, $links);
        $linkCount = count($links[0]);
        $wordCount = str_word_count(strip_tags($body));

        if ($linkCount > 0 && $wordCount > 0) {
            $linkRatio = $linkCount / max(1, $wordCount / 100);
            if ($linkRatio > 5) { // More than 5 links per 100 words
                $this->score -= 10;
                $this->warnings[] = [
                    'type' => 'too_many_links',
                    'message' => 'Email has excessive links. Reduce to 2-3 relevant links.',
                ];
            }
        }

        // Check for unsubscribe link
        if (stripos($body, 'unsubscribe') === false) {
            $this->score -= 15;
            $this->issues[] = [
                'type' => 'missing_unsubscribe',
                'message' => 'No unsubscribe link found. CAN-SPAM requires one.',
                'severity' => 'high',
            ];
        }

        // Check for physical address
        if (!preg_match('/\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)/i', $body)) {
            $this->score -= 10;
            $this->warnings[] = [
                'type' => 'missing_address',
                'message' => 'No physical address found. CAN-SPAM compliance requires one.',
            ];
        }
    }

    /**
     * Check authentication setup
     */
    private function checkAuthentication(string $senderEmail, string $domain): void
    {
        $senderDomain = substr(strrchr($senderEmail, "@"), 1);

        // Domain mismatch
        if ($senderDomain !== $domain) {
            $this->score -= 15;
            $this->warnings[] = [
                'type' => 'domain_mismatch',
                'message' => "Sender domain ({$senderDomain}) doesn't match sending domain ({$domain}). May cause alignment issues.",
            ];
        }
    }

    /**
     * Get overall health rating
     */
    private function getHealthRating(): string
    {
        if ($this->score >= 90) return 'excellent';
        if ($this->score >= 75) return 'good';
        if ($this->score >= 60) return 'fair';
        if ($this->score >= 40) return 'poor';
        return 'critical';
    }

    /**
     * Estimate inbox placement rate based on score
     */
    private function estimateInboxRate(): int
    {
        // Convert score to inbox rate percentage
        if ($this->score >= 90) return 95; // Excellent = 95% inbox rate
        if ($this->score >= 75) return 85; // Good = 85%
        if ($this->score >= 60) return 70; // Fair = 70%
        if ($this->score >= 40) return 45; // Poor = 45%
        return 20; // Critical = 20%
    }

    /**
     * Get actionable recommendations
     */
    private function getRecommendations(): array
    {
        $recommendations = [];

        if (!empty($this->issues)) {
            $recommendations[] = [
                'priority' => 'high',
                'action' => 'Fix all critical issues before sending',
                'count' => count($this->issues),
            ];
        }

        if (!empty($this->warnings)) {
            $recommendations[] = [
                'priority' => 'medium',
                'action' => 'Address warnings to improve deliverability',
                'count' => count($this->warnings),
            ];
        }

        if (empty($this->issues) && empty($this->warnings)) {
            $recommendations[] = [
                'priority' => 'low',
                'action' => 'Email looks good! Ready to send.',
            ];
        }

        return $recommendations;
    }

    /**
     * Check CAN-SPAM compliance requirements
     */
    private function checkCANSPAMCompliance(): void
    {
        $unsubscribeLink = \DB::table('settings')
            ->where('key', 'email_unsubscribe_link')
            ->value('value');

        $physicalAddress = \DB::table('settings')
            ->where('key', 'email_physical_address')
            ->value('value');

        // Check for unsubscribe link (CRITICAL)
        if (empty($unsubscribeLink)) {
            $this->score -= 20;
            $this->issues[] = [
                'type' => 'missing_unsubscribe',
                'message' => 'No unsubscribe link found. CAN-SPAM requires one.',
                'severity' => 'critical',
                'description' => 'Add an unsubscribe URL in Settings → Email Compliance',
            ];
        }

        // Check for physical address (WARNING)
        if (empty($physicalAddress)) {
            $this->score -= 5;
            $this->warnings[] = [
                'type' => 'missing_address',
                'message' => 'No physical address found. CAN-SPAM compliance requires one.',
                'description' => 'Add your business address in Settings → Email Compliance',
            ];
        }
    }

    /**
     * Check SPF record
     */
    private function checkSPF(string $domain): ?array
    {
        try {
            $records = dns_get_record($domain, DNS_TXT);
            foreach ($records as $record) {
                if (strpos($record['txt'] ?? '', 'v=spf1') === 0) {
                    return [
                        'valid' => true,
                        'record' => $record['txt'],
                    ];
                }
            }
        } catch (\Exception $e) {
            // DNS lookup failed
        }
        return null;
    }

    /**
     * Check DKIM record
     */
    private function checkDKIM(string $domain): bool
    {
        try {
            // Check for default DKIM selector
            $selectors = ['default', 'selector1', 'selector2', 'google', 'k1'];
            foreach ($selectors as $selector) {
                $dkimDomain = "{$selector}._domainkey.{$domain}";
                $records = @dns_get_record($dkimDomain, DNS_TXT);
                if ($records && count($records) > 0) {
                    return true;
                }
            }
        } catch (\Exception $e) {
            // DNS lookup failed
        }
        return false;
    }

    /**
     * Check DMARC record
     */
    private function checkDMARC(string $domain): bool
    {
        try {
            $dmarcDomain = "_dmarc.{$domain}";
            $records = dns_get_record($dmarcDomain, DNS_TXT);
            foreach ($records as $record) {
                if (strpos($record['txt'] ?? '', 'v=DMARC1') === 0) {
                    return true;
                }
            }
        } catch (\Exception $e) {
            // DNS lookup failed
        }
        return false;
    }
}
