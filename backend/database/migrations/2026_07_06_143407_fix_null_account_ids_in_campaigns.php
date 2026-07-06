<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Fixes existing campaigns with null account IDs in the account_ids JSON array.
     * This removes null values that cause "The route api/accounts/null/status could not be found" errors.
     */
    public function up(): void
    {
        // Get all campaigns with account_ids containing null
        $campaigns = DB::table('bulk_email_campaigns')->get();

        foreach ($campaigns as $campaign) {
            $accountIds = json_decode($campaign->account_ids, true) ?? [];

            // Filter out null and undefined values
            $filtered = array_values(array_filter($accountIds, function($id) {
                return $id !== null && $id !== 'null';
            }));

            // Only update if there were changes
            if (count($filtered) !== count($accountIds)) {
                DB::table('bulk_email_campaigns')
                    ->where('id', $campaign->id)
                    ->update([
                        'account_ids' => json_encode($filtered),
                        'updated_at' => now(),
                    ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This is a data cleanup, no need to reverse
    }
};
