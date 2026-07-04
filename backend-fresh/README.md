# Using mail-tester (if available)
openssl genrsa -out private.key 2048
openssl rsa -in private.key -pubout -out public.key

# Or use these tools:
# - https://www.dkim-generator.com/
# - Linux: `openssl genrsa -out mail.private.key 2048`


mkdir -p /var/www/mail
cd /var/www/mail

# From your local machine
scp -r ./mail-sender/backend-fresh user@your-vps:/var/www/mail/
scp -r ./mail-sender/admin user@your-vps:/var/www/mail/

scp deploy.sh user@your-vps:/var/www/mail/backend-fresh/
ssh user@your-vps "chmod +x /var/www/mail/backend-fresh/deploy.sh"

ssh user@your-vps "bash /var/www/mail/backend-fresh/deploy.sh"

ssh user@your-vps
sudo visudo

www-data ALL=(ALL) NOPASSWD: /usr/sbin/chown
www-data ALL=(ALL) NOPASSWD: /usr/sbin/chmod
www-data ALL=(ALL) NOPASSWD: /usr/bin/systemctl