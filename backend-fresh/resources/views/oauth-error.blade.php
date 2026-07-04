<!DOCTYPE html>
<html>
<head>
    <title>Authorization Failed</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            max-width: 400px;
        }
        .error-icon {
            color: #f44336;
            font-size: 50px;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin: 0 0 10px 0;
        }
        p {
            color: #666;
            margin: 0 0 20px 0;
            line-height: 1.5;
        }
        .error-code {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            color: #d32f2f;
            margin: 15px 0;
            word-break: break-all;
        }
        .info {
            font-size: 12px;
            color: #999;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Authorization Failed</h1>
        <p>{{ $message }}</p>
        <div class="error-code">{{ $error }}</div>
        <p class="info">You can close this window and try again.</p>
    </div>
</body>
</html>
