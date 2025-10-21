<?php
use Illuminate\Http\Request;

// chaeum.or.kr 접속 시 '준비중' 페이지로 리다이렉트
$host = $_SERVER['HTTP_HOST'];
if ($host === 'chaeum.or.kr' || $host === 'www.chaeum.or.kr') {
    header('Location: /index.html');
    exit;
}

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());