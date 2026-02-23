# Deployment Checklist

Use this checklist to ensure a complete and successful deployment.

## Pre-Deployment

### Server Setup
- [ ] VPS provisioned (Ubuntu 22.04 LTS)
- [ ] Minimum 2GB RAM allocated
- [ ] Minimum 20GB storage allocated
- [ ] Public IP address assigned
- [ ] SSH access configured

### Domain Configuration
- [ ] Domain purchased/available
- [ ] A record pointing to server IP
- [ ] DNS propagation verified (can take up to 48 hours)

### API Keys & Credentials
- [ ] OpenAI API key obtained
- [ ] Twilio account created
- [ ] Twilio phone number purchased
- [ ] SMTP credentials ready
- [ ] Meta Developer account created
- [ ] WhatsApp Business API access granted
- [ ] Facebook/Instagram app created
- [ ] Azure AD application registered
- [ ] Microsoft Graph API permissions granted

## Deployment

### Base Installation
- [ ] Connected to server via SSH
- [ ] System packages updated
- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Firewall (UFW) configured
- [ ] Fail2ban installed

### Application Setup
- [ ] Application files copied to /opt/heavenlydrops
- [ ] Environment file created
- [ ] All API keys added to .env
- [ ] Database password set
- [ ] JWT secret generated
- [ ] Redis password generated

### Service Startup
- [ ] PostgreSQL container running
- [ ] Redis container running
- [ ] Backend container built and running
- [ ] Frontend container built and running
- [ ] Nginx container running
- [ ] Database migrations executed
- [ ] Initial admin user created

### SSL Configuration
- [ ] Let's Encrypt certificate obtained
- [ ] HTTPS working
- [ ] Auto-renewal configured
- [ ] HTTP redirects to HTTPS

## Post-Deployment

### Webhook Configuration
- [ ] WhatsApp webhook URL configured in Meta Console
- [ ] WhatsApp verify token set
- [ ] Instagram webhook URL configured
- [ ] Instagram verify token set
- [ ] Twilio voice webhook configured
- [ ] Twilio status callback configured

### Knowledge Sync
- [ ] Initial knowledge sync completed
- [ ] Study in Spain content parsed
- [ ] Work in Czech content parsed
- [ ] About Us content parsed
- [ ] Sync schedule configured

### Testing
- [ ] Admin panel accessible
- [ ] Login working
- [ ] Lead form submission working
- [ ] WhatsApp message received and processed
- [ ] Instagram message received and processed
- [ ] AI response generated
- [ ] Email sent successfully
- [ ] Voice call initiated
- [ ] Teams meeting created
- [ ] Summary email received

### Security
- [ ] Default admin password changed
- [ ] Strong passwords set for all accounts
- [ ] API keys secured
- [ ] Firewall rules verified
- [ ] Fail2ban running
- [ ] No sensitive data in logs
- [ ] HTTPS enforced

### Monitoring
- [ ] Service status check working
- [ ] Log viewing configured
- [ ] Backup script tested
- [ ] Alerting configured (optional)

## Go-Live

### Final Checks
- [ ] All services healthy
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] SSL certificate valid
- [ ] Domain accessible

### Team Training
- [ ] Admin panel walkthrough completed
- [ ] Lead management process explained
- [ ] Conversation handling demonstrated
- [ ] Appointment scheduling shown
- [ ] Troubleshooting guide provided

### Documentation
- [ ] Installation guide updated
- [ ] API documentation available
- [ ] User manual created
- [ ] Emergency contacts listed

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| Project Manager | | | |
| Client Representative | | | |

## Notes

```
Add any additional notes or observations here:




```
