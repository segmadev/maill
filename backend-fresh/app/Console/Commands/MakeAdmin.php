<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class MakeAdmin extends Command
{
    protected $signature   = 'admin:make {email? : Email of the user to promote}
                                         {--create : Create the user if they do not exist}
                                         {--password= : Password (only used with --create)}';

    protected $description = 'Promote an existing user to admin, or create a new admin user';

    public function handle(): int
    {
        $email = $this->argument('email') ?? $this->ask('Enter the user email');

        $user = User::where('email', $email)->first();

        if ($user === null) {
            if (!$this->option('create')) {
                $this->error("No user found with email: {$email}");
                $this->line('Use --create to create a new admin user.');
                return self::FAILURE;
            }

            $name     = $this->ask('Enter name for the new user');
            $password = $this->option('password') ?? $this->secret('Enter password (min 8 chars)');

            if (strlen($password) < 8) {
                $this->error('Password must be at least 8 characters.');
                return self::FAILURE;
            }

            $user = User::create([
                'name'      => $name,
                'email'     => $email,
                'password'  => Hash::make($password),
                'is_admin'  => true,
                'is_active' => true,
            ]);

            $this->info("Admin user created: {$user->name} <{$user->email}>");
            return self::SUCCESS;
        }

        if ($user->is_admin) {
            $this->warn("{$user->email} is already an admin.");
            return self::SUCCESS;
        }

        $user->update(['is_admin' => true, 'is_active' => true]);
        $this->info("Promoted {$user->email} to admin.");

        return self::SUCCESS;
    }
}
