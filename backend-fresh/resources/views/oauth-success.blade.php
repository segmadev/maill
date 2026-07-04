<!DOCTYPE html>
<html>
<head>
    <title>Authorization Successful</title>
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
        }
        .checkmark {
            color: #4caf50;
            font-size: 50px;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin: 0 0 10px 0;
        }
        p {
            color: #666;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="checkmark">✅</div>
        <h1>Success!</h1>
        <p><strong>{{ $email }}</strong></p>
        <p>{{ $message }}</p>
    </div>

    <script>
        // Auto-close the window after 2 seconds
        setTimeout(function() {
            window.close();
        }, 2000);
    </script>
</body>
</html>
