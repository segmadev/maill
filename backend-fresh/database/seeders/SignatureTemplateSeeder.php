<?php

namespace Database\Seeders;

use App\Models\SignatureTemplate;
use Illuminate\Database\Seeder;

class SignatureTemplateSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        SignatureTemplate::updateOrCreate(
            ['name' => 'Professional'],
            [
                'description' => 'Clean and professional signature for business communication',
                'html_template' => '<div style="font-family: Arial, sans-serif; color: #333; font-size: 12px; line-height: 1.6;">
  <strong>{{accountName}}</strong><br>
  {{accountEmail}}<br>
  {{accountPhone}}<br>
  <br>
  <em>{{companyName}}</em>
</div>',
                'variables' => ['accountName', 'accountEmail', 'accountPhone', 'companyName'],
                'preview_image' => null,
            ]
        );

        SignatureTemplate::updateOrCreate(
            ['name' => 'Formal'],
            [
                'description' => 'Formal signature with full contact details',
                'html_template' => '<div style="font-family: Georgia, serif; color: #2c3e50; font-size: 13px; line-height: 1.7; border-left: 3px solid #3498db; padding-left: 10px; margin-top: 10px;">
  <strong style="font-size: 14px;">{{accountName}}</strong><br>
  <span style="color: #7f8c8d;">{{accountEmail}}</span><br>
  <span style="color: #7f8c8d;">{{accountPhone}}</span><br>
  <br>
  <span style="font-size: 12px;">{{companyName}}</span><br>
  <span style="font-size: 11px; color: #95a5a6;">{{currentDate}}</span>
</div>',
                'variables' => ['accountName', 'accountEmail', 'accountPhone', 'companyName', 'currentDate'],
                'preview_image' => null,
            ]
        );

        SignatureTemplate::updateOrCreate(
            ['name' => 'Minimal'],
            [
                'description' => 'Minimal signature with just essential information',
                'html_template' => '<div style="font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; font-size: 12px; color: #333;">
{{accountName}}<br>
<a href="mailto:{{accountEmail}}" style="color: #0066cc; text-decoration: none;">{{accountEmail}}</a>
</div>',
                'variables' => ['accountName', 'accountEmail'],
                'preview_image' => null,
            ]
        );

        SignatureTemplate::updateOrCreate(
            ['name' => 'Startup'],
            [
                'description' => 'Modern startup-style signature',
                'html_template' => '<div style="font-family: \'Helvetica Neue\', sans-serif; font-size: 12px; color: #222;">
  <div style="margin-bottom: 8px;">
    <strong style="font-size: 13px; color: #1a73e8;">{{accountName}}</strong><br>
    <span style="color: #5f6368; font-size: 11px;">{{accountEmail}}</span>
  </div>
  <div style="border-top: 1px solid #dadce0; padding-top: 8px; margin-top: 8px;">
    <span style="font-size: 11px; color: #5f6368;">{{companyName}}</span><br>
    <span style="font-size: 11px; color: #5f6368;">📞 {{accountPhone}}</span>
  </div>
</div>',
                'variables' => ['accountName', 'accountEmail', 'accountPhone', 'companyName'],
                'preview_image' => null,
            ]
        );
    }
}
