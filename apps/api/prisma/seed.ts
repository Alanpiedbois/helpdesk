/**
 * Demo data: `npx prisma db seed`.
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
  author: Email;
  assignee?: Email;
  status: TicketStatus;
  priority: TicketPriority;
  messages: { from: Email; body: string; internal?: boolean }[];
}

const tickets: SeedTicket[] = [
  {
    subject: "Impossible d'exporter mes factures en PDF",
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
    await prisma.ticket.create({
      data: {
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        authorId: ids[t.author],
        assigneeId: t.assignee ? ids[t.assignee] : null,
        messages: {
          create: t.messages.map((m) => ({
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
