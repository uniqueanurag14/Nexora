/**
 * NEXORA ERP — cPanel "Setup Node.js App" (Phusion Passenger) Entry Point
 *
 * Configure in cPanel -> Setup Node.js App:
 *   Application mode:         Production
 *   Application root:         /home/<cpanel_user>/nexora
 *   Application URL:          abcd.com
 *   Application startup file: deploy/cpanel/passenger_entry.mjs
 *
 * Note: Phusion Passenger manages socket binding automatically and forwards
 * HTTPS requests from Apache directly to Express on the same domain.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.APP_ENV = process.env.APP_ENV || 'production';

// Load TypeScript server cleanly using tsx runtime loader
import('tsx/esm')
  .then(() => import('../../server.ts'))
  .catch((err) => {
    console.error('[Nexora Passenger Boot Error]:', err);
    process.exit(1);
  });
