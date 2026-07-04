<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_the_application_returns_not_found_for_root_route(): void
    {
        $response = $this->get('/');

        $response->assertStatus(404);
    }
}
