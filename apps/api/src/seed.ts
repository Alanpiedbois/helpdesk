/**
 * Demo data: `npx prisma db seed` (dev) or `node dist/seed.js` (Docker image).
 * Safe to run several times: users are upserted, tickets are only created on an empty table.
 * All demo accounts use the password "demo-password".
 */
import {
  PrismaClient,
  Role,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const users = [
  { email: 'admin@demo.helpdesk', name: 'Camille Admin', role: Role.ADMIN },
  { email: 'agent.lea@demo.helpdesk', name: 'Léa Martin', role: Role.AGENT },
  { email: 'agent.hugo@demo.helpdesk', name: 'Hugo Bernard', role: Role.AGENT },
  { email: 'client.nina@demo.helpdesk', name: 'Nina Lefebvre', role: Role.CLIENT },
  { email: 'client.omar@demo.helpdesk', name: 'Omar Dubois', role: Role.CLIENT },
] as const;

type Email = (typeof users)[number]['email'];

interface SeedTicket {
  subject: string;
  daysAgo: number;
  /** Minutes until the first public staff reply (drives the dashboard average). */
  firstResponseMinutes?: number;
  author: Email;
  assignee?: Email;
  status: TicketStatus;
  priority: TicketPriority;
  messages: { from: Email; body: string; internal?: boolean }[];
}

const tickets: SeedTicket[] = [
  {
    subject: "Impossible d'exporter mes factures en PDF",
    daysAgo: 0,
    author: 'client.nina@demo.helpdesk',
    status: TicketStatus.OPEN,
    priority: TicketPriority.HIGH,
    messages: [
      {
        from: 'client.nina@demo.helpdesk',
        body: "Quand je clique sur « Exporter », rien ne se passe. J'ai besoin des factures d'octobre pour ma comptable.",
      },
    ],
  },
  {
    subject: 'Double prélèvement sur mon abonnement',
    daysAgo: 1,
    author: 'client.omar@demo.helpdesk',
    assignee: 'agent.lea@demo.helpdesk',
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.URGENT,
    messages: [
      {
        from: 'client.omar@demo.helpdesk',
        body: "J'ai été prélevé deux fois ce mois-ci (2 × 49 €). Pouvez-vous me rembourser ?",
      },
      {
        from: 'agent.lea@demo.helpdesk',
        body: 'Vu avec la compta : deux paiements Stripe le 3/11. Remboursement à valider par Camille.',
        internal: true,
      },
    ],
  },
  {
    subject: 'Ajouter un collaborateur à mon compte',
    daysAgo: 2,
    firstResponseMinutes: 35,
    author: 'client.nina@demo.helpdesk',
    assignee: 'agent.hugo@demo.helpdesk',
    status: TicketStatus.WAITING_CUSTOMER,
    priority: TicketPriority.LOW,
    messages: [
      { from: 'client.nina@demo.helpdesk', body: 'Comment donner accès à mon associé ?' },
      {
        from: 'agent.hugo@demo.helpdesk',
        body: "Allez dans Paramètres > Équipe > Inviter. Votre offre inclut 3 utilisateurs : voulez-vous que je l'invite pour vous ?",
      },
    ],
  },
  {
    subject: "L'application est lente le matin",
    daysAgo: 4,
    firstResponseMinutes: 80,
    author: 'client.omar@demo.helpdesk',
    assignee: 'agent.hugo@demo.helpdesk',
    status: TicketStatus.RESOLVED,
    priority: TicketPriority.MEDIUM,
    messages: [
      { from: 'client.omar@demo.helpdesk', body: 'Entre 9h et 10h, les pages mettent 10 secondes à charger.' },
      { from: 'agent.hugo@demo.helpdesk', body: 'Un correctif a été déployé hier soir. Pouvez-vous confirmer que tout est rentré dans l’ordre ?' },
    ],
  },
];

// Older, closed conversations so the dashboard has two weeks of history.
const history: [string, number, number][] = [
  ['Changer l’adresse de facturation', 5, 25],
  ['Erreur 500 à la connexion', 6, 12],
  ['Comment exporter mes contacts ?', 7, 50],
  ['Le lien de réinitialisation a expiré', 8, 20],
  ['Demande de facture rectificative', 9, 95],
  ['Synchronisation agenda en échec', 10, 40],
  ['Suggestion : mode sombre', 11, 180],
  ['Notifications e-mail en double', 12, 30],
  ['Import CSV refusé', 12, 65],
  ['Suppression de compte', 13, 45],
];
for (const [subject, daysAgo, minutes] of history) {
  const client = daysAgo % 2 ? 'client.omar@demo.helpdesk' : 'client.nina@demo.helpdesk';
  const agent = daysAgo % 3 ? 'agent.lea@demo.helpdesk' : 'agent.hugo@demo.helpdesk';
  tickets.push({
    subject,
    daysAgo,
    firstResponseMinutes: minutes,
    author: client,
    assignee: agent,
    status: TicketStatus.CLOSED,
    priority: TicketPriority.MEDIUM,
    messages: [
      { from: client, body: 'Bonjour, pouvez-vous m’aider ?' },
      { from: agent, body: 'Bonjour, c’est réglé de notre côté. Bonne journée !' },
    ],
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  const passwordHash = await argon2.hash('demo-password');
  const ids = {} as Record<Email, string>;

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passwordHash },
    });
    ids[u.email] = user.id;
  }

  if ((await prisma.ticket.count()) > 0) {
    console.log('Tickets already present, skipping ticket seed.');
    return;
  }

  for (const t of tickets) {
    // Spread over the day so the timeline looks natural; messages follow the ticket.
    const createdMinutesAgo = t.daysAgo * 1440 + 120;
    const createdAt = minutesAgo(createdMinutesAgo);
    await prisma.ticket.create({
      data: {
        subject: t.subject,
        createdAt,
        firstResponseAt:
          t.firstResponseMinutes === undefined
            ? null
            : minutesAgo(createdMinutesAgo - t.firstResponseMinutes),
        status: t.status,
        priority: t.priority,
        authorId: ids[t.author],
        assigneeId: t.assignee ? ids[t.assignee] : null,
        messages: {
          create: t.messages.map((m, i) => ({
            createdAt: minutesAgo(createdMinutesAgo - (t.firstResponseMinutes ?? 30) * i),
            authorId: ids[m.from],
            body: m.body,
            internal: m.internal ?? false,
          })),
        },
      },
    });
  }
  console.log(`Seeded ${users.length} users and ${tickets.length} tickets.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
