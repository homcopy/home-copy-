// api/webhook.js
// Reçoit les notifications de paiement Stripe, génère une clé d'accès Homecopy
// et l'envoie par email au client via Resend.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Mapping entre le lien de paiement Stripe et l'offre correspondante
const PRICE_TO_PLAN = {
  // Remplace ces IDs par les vrais Price ID Stripe (voir étape 3.4)
  'price_essentiel': 'essentiel',
  'price_pro': 'pro',
  'price_agence': 'agence'
};

// Génère une clé unique du type HC-XXXX-XXXX-XXXX
function generateKey(plan) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `HC-${segment()}-${segment()}-${segment()}`;
}

async function sendKeyEmail(toEmail, key, planName) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Homecopy <onboarding@resend.dev>',
      to: toEmail,
      subject: 'Votre clé d\'accès Homecopy',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #2563EB;">Bienvenue sur Homecopy !</h2>
          <p>Merci pour votre abonnement <strong>${planName}</strong>.</p>
          <p>Voici votre clé d'accès personnelle :</p>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; text-align: center; font-size: 20px; font-weight: bold; letter-spacing: 1px; margin: 16px 0;">
            ${key}
          </div>
          <p>Rendez-vous sur Homecopy, cliquez sur "Entrer ma clé d'accès" et collez ce code pour débloquer votre offre.</p>
          <p style="margin-top: 24px; font-size: 13px; color: #64748B;">
            Une question ? Répondez simplement à cet email.
          </p>
        </div>
      `
    })
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  let event;

  try {
    // Vérifie que la requête vient bien de Stripe (sécurité)
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // On ne réagit qu'aux paiements réussis
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const customerEmail = session.customer_details?.email;
    const priceId = session.line_items?.data?.[0]?.price?.id || session.metadata?.price_id;

    // Récupère le plan acheté à partir du price ID
    const plan = PRICE_TO_PLAN[priceId] || 'essentiel';
    const planNames = { essentiel: 'Essentiel', pro: 'Pro', agence: 'Agence' };

    const key = generateKey(plan);

    // TODO étape 3.5 : stocker la clé dans une base de données pour la valider plus tard
    // Pour l'instant la clé est générée et envoyée, mais pas encore vérifiable côté site

    if (customerEmail) {
      await sendKeyEmail(customerEmail, key, planNames[plan]);
    }
  }

  res.status(200).json({ received: true });
}

export const config = {
  api: {
    bodyParser: false // requis par Stripe pour vérifier la signature
  }
};
