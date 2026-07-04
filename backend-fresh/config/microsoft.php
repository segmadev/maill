<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Microsoft Azure App Registration credentials
    |--------------------------------------------------------------------------
    | These map directly to the values from portal.azure.com.
    | MICROSOFT_TENANT_ID defaults to "common" which allows both personal
    | Microsoft accounts and work/school (Azure AD) accounts. Change to your
    | specific tenant ID if you only want organizational accounts.
    |
    | IMPORTANT: Set IS_PUBLIC_CLIENT to true if your app is registered as a
    | "Public client" in Azure. Public clients cannot send a client_secret
    | in token refresh requests. If your app is registered as "Confidential",
    | ensure client_secret is configured and IS_PUBLIC_CLIENT is false.
    */

    'client_id'           => env('MICROSOFT_CLIENT_ID'),
    'client_secret'       => env('MICROSOFT_CLIENT_SECRET'),
    'tenant_id'           => env('MICROSOFT_TENANT_ID', 'common'),
    'redirect_uri'        => env('MICROSOFT_REDIRECT_URI'),
    'is_public_client'    => env('MICROSOFT_IS_PUBLIC_CLIENT', false),

    /*
    |--------------------------------------------------------------------------
    | Sign-in scopes (used for authentication only — no mail access)
    |--------------------------------------------------------------------------
    | These three scopes never require admin consent on any tenant type
    | (personal or organisational). They identify the user and keep the
    | session alive, but do NOT request access to the user's mailbox.
    |
    | Mail.Read is intentionally excluded here because Microsoft requires
    | admin consent for mailbox-access permissions on organisational tenants,
    | regardless of whether the permission is delegated. Users can still sign
    | in freely; mail access is requested separately via the mail_scopes below.
    */

    'scopes' => [
        'openid',         // OIDC sign-in token — never needs admin consent
        'offline_access', // refresh token so sessions stay alive — never needs admin consent
        'User.Read',      // read own profile (name, email) — never needs admin consent
    ],

    /*
    |--------------------------------------------------------------------------
    | Mail connection scopes (requested separately when linking a mailbox)
    |--------------------------------------------------------------------------
    | These are only requested when the user explicitly connects a mailbox.
    | Personal Microsoft accounts: no admin consent needed.
    | Organisational accounts: the tenant admin must approve once — this is
    | a Microsoft security requirement and cannot be bypassed in code.
    */

    'mail_scopes' => [
        'openid',
        'offline_access',
        'User.Read',
        'Mail.Read',
    ],

];
