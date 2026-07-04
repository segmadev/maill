<?php

namespace App\Services;

/**
 * PHP's libcurl is compiled with c-ares (async DNS) which fails to use the
 * system resolver on this machine. The workaround is to pre-resolve hostnames
 * using PHP's own gethostbyname() (which uses the Windows system resolver)
 * and inject the results via CURLOPT_RESOLVE so c-ares is bypassed entirely.
 */
class CurlDnsHelper
{
    /** Hosts that every Guzzle client talking to Microsoft needs to resolve. */
    private const HOSTS = [
        'graph.microsoft.com',
        'login.microsoftonline.com',
    ];

    /**
     * Returns a Guzzle-compatible 'curl' options array with CURLOPT_RESOLVE
     * pre-populated for all Microsoft endpoints.
     *
     * @return array{CURLOPT_RESOLVE: list<string>}
     */
    public static function curlOptions(): array
    {
        $entries = [];

        foreach (self::HOSTS as $host) {
            $ip = gethostbyname($host);

            // gethostbyname returns the original string on failure
            if ($ip !== $host) {
                $entries[] = "{$host}:443:{$ip}";
                $entries[] = "{$host}:80:{$ip}";
            }
        }

        return [CURLOPT_RESOLVE => $entries];
    }
}
