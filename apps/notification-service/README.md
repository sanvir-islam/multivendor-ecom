## Production Roadmap

This service intentionally has no database in v1. Production additions would include:

- **Notifications table** in PostgreSQL: audit trail of every email sent
- **UserPreferences table**: opt-in/opt-out per notification category
- **Templates table**: versioned templates with A/B testing
- **DeliveryAttempts table**: retry tracking with exponential backoff
- **Multi-channel router**: SMS via Twilio, push via FCM, in-app via WebSocket
- **Webhook handlers**: process bounces and complaints from email provider
- **Dead-letter queue**: failed events for manual review