require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');

// Initialisation du client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// Environnement
const PREFIX = process.env.PREFIX || '!';
const UPDATE_CHANNEL_ID = process.env.UPDATE_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const ROLE_CHANNEL_ID = process.env.ROLE_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BANK_CHANNEL_ID = process.env.BANK_CHANNEL_ID;
const EVENT_CHANNEL_ID = process.env.EVENT_CHANNEL_ID;

// Fichiers
const EVENTS_FILE = path.join(__dirname, 'events.json');
const EVENT_MSG_ID_FILE = path.join(__dirname, 'eventmsg_id.txt');
const BANK_FILE = path.join(__dirname, 'banque.json');
const BANK_MSG_ID_FILE = path.join(__dirname, 'bankmsg_id.txt');

// Chargement des commandes
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            const cmd = require(path.join(commandsPath, file));
            if (cmd.name && typeof cmd.execute === 'function') {
                client.commands.set(cmd.name, cmd);
            }
        });
}

// Handler commandes textuelles
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const [name, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = client.commands.get(name.toLowerCase());
    if (!cmd) return;
    try {
        await cmd.execute(message, args);
    } catch (err) {
        console.error(`Erreur commande ${name}:`, err);
        await message.reply('❌ Une erreur est survenue.');
    }
});

// --- UTILITAIRES ÉVÉNEMENTS ---
function loadEvents() {
    try { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')); }
    catch { fs.writeFileSync(EVENTS_FILE, '[]', 'utf8'); return []; }
}
function saveEvents(events) {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
}
function buildEventsEmbed(events) {
    if (!events.length) {
        return new EmbedBuilder()
            .setTitle('📋 Événements Stormbreaker')
            .setDescription('Aucun événement pour l’instant.')
            .setColor(0x3498DB)
            .setTimestamp();
    }
    const fields = events.map((e, i) => ({
        name: `📌 [${i}] ${e.title} — ${e.date}`,
        value: `${e.description}\n👥 Participants: ${(e.participants || []).map(u => `<@${u}>`).join(', ') || 'Personne'}\n🙅 Refus: ${(e.nonParticipants || []).map(u => `<@${u}>`).join(', ') || 'Aucun refus'}`
    }));
    return new EmbedBuilder()
        .setTitle('📋 Événements Stormbreaker')
        .addFields(fields)
        .setColor(0x3498DB)
        .setTimestamp();
}
function buildEventsRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh_events').setLabel('🔄 Rafraîchir').setStyle(ButtonStyle.Secondary)
    );
}

// --- UTILITAIRES BANQUE ---
function loadBank() {
    try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); }
    catch { const init = { total: 0, transactions: [], donateurs: {} }; fs.writeFileSync(BANK_FILE, JSON.stringify(init, null, 2), 'utf8'); return init; }
}
function saveBank(b) { fs.writeFileSync(BANK_FILE, JSON.stringify(b, null, 2), 'utf8'); }
function formatAUEC(a) { return `${Number(a).toLocaleString()} aUEC`; }
function buildBankEmbed() {
    const b = loadBank();
    const top = Object.entries(b.donateurs).sort(([, x], [, y]) => y - x).slice(0, 5).map(([id, amt], i) => `${i + 1}. <@${id}> — ${formatAUEC(amt)}`).join('\n') || 'Aucun donateur.';
    return new EmbedBuilder()
        .setTitle('🏦 Banque Stormbreaker')
        .setDescription(`💰 Total actuel : **${formatAUEC(b.total)}**\n\n👑 Top donateurs :\n${top}`)
        .setColor(0x2ecc71)
        .setTimestamp();
}
function buildDonationRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_donation_modal').setLabel('💸 Proposer un don').setStyle(ButtonStyle.Primary)
    );
}

// --- READY ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // Vérification MAJ
    const pkg = require('./package.json'), vf = path.join(__dirname, 'lastversion.txt'); let lv = ''; if (fs.existsSync(vf)) lv = fs.readFileSync(vf, 'utf8').trim();
    if (pkg.version !== lv) { const ch = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null); if (ch?.isTextBased()) { let log = '- Aucun changelog.'; const cf = path.join(__dirname, 'changelog.json'); if (fs.existsSync(cf)) { const cj = JSON.parse(fs.readFileSync(cf, 'utf8')); log = cj[pkg.version] || log; } await ch.send({ embeds: [new EmbedBuilder().setTitle(`🔄 Mise à jour v${pkg.version}`).setDescription(log).setColor(0xFFA500).setTimestamp()] }); fs.writeFileSync(vf, pkg.version, 'utf8'); } }

    // Boutons rôles initiaux
    const rc = await client.channels.fetch(ROLE_CHANNEL_ID).catch(() => null);
    if (rc?.isTextBased()) {
        const rf = path.join(__dirname, 'role_button_id.txt'); if (!fs.existsSync(rf)) {
            const eb = new EmbedBuilder().setTitle('🎭 Choisis ton orientation').setDescription('Appuie pour un salon privé').setColor(0x3498DB);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('open_candidature').setLabel('📄 Candidature').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('open_ambassade').setLabel('🤝 Ambassade').setStyle(ButtonStyle.Secondary)
            ); const m = await rc.send({ embeds: [eb], components: [row] }); fs.writeFileSync(rf, m.id, 'utf8');
        }
    }

    // Message banque permanent
    if (BANK_CHANNEL_ID) { const bc = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null); if (bc?.isTextBased()) { let mid = ''; if (fs.existsSync(BANK_MSG_ID_FILE)) mid = fs.readFileSync(BANK_MSG_ID_FILE, 'utf8').trim(); let msg = mid ? await bc.messages.fetch(mid).catch(() => null) : null; if (!msg) { msg = await bc.send({ embeds: [buildBankEmbed()], components: [buildDonationRow()] }); fs.writeFileSync(BANK_MSG_ID_FILE, msg.id, 'utf8'); } else { await msg.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] }); } } }

    // Message événements permanent
    if (EVENT_CHANNEL_ID) { const ec = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null); if (ec?.isTextBased()) { let eid = ''; if (fs.existsSync(EVENT_MSG_ID_FILE)) eid = fs.readFileSync(EVENT_MSG_ID_FILE, 'utf8').trim(); let em = eid ? await ec.messages.fetch(eid).catch(() => null) : null; const ebd = buildEventsEmbed(loadEvents()), erow = buildEventsRow(); if (!em) { em = await ec.send({ embeds: [ebd], components: [erow] }); fs.writeFileSync(EVENT_MSG_ID_FILE, em.id, 'utf8'); } else { await em.edit({ embeds: [ebd], components: [erow] }); } } }
});

// Bienvenue
client.on(Events.GuildMemberAdd, async member => {
    const wc = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (wc?.isTextBased()) wc.send({ embeds: [new EmbedBuilder().setTitle(`👋 Bienvenue, ${member.user.username} !`).setDescription(`Bienvenue sur **${member.guild.name}** !`).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setColor(0x00AE86).setTimestamp()] });
});

// InteractionCreate
client.on(Events.InteractionCreate, async interaction => {
    const id = interaction.customId;

    // Salons privés
    if (interaction.isButton() && ['open_ticket', 'open_candidature', 'open_ambassade'].includes(id)) {
        const m = interaction.member, g = interaction.guild;
        const name = `${id.replace('open_', '')}-${m.user.username}`.toLowerCase();
        const roles = { open_ticket: ['Administrator', 'moderator'], open_candidature: ['Administrator', 'recruiter'], open_ambassade: ['Administrator', 'moderator'] }[id] || [];
        const overwrites = [{ id: g.roles.everyone.id, deny: ['ViewChannel'] }, { id: m.id, allow: ['ViewChannel', 'SendMessages'] },
        ...roles.map(rn => g.roles.cache.find(r => r.name.toLowerCase() === rn.toLowerCase())).filter(Boolean).map(r => ({ id: r.id, allow: ['ViewChannel', 'SendMessages'] }))];
        const c = await g.channels.create({ name, type: 0, permissionOverwrites: overwrites });
        await c.send({ content: `<@${m.id}>`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('delete_channel').setLabel('🗑️ Supprimer le salon').setStyle(ButtonStyle.Danger))] });
        return interaction.reply({ content: '✅ Salon créé.', ephemeral: true });
    }

    // Suppression salon avec transcription
    if (interaction.isButton() && id === 'delete_channel') {
        if (!interaction.member.roles.cache.some(r => ['Administrator', 'moderator', 'recruiter'].includes(r.name))) return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
        const msgs = await interaction.channel.messages.fetch({ limit: 100 });
        const log = msgs.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
        const fname = `log-${interaction.channel.name}-${Date.now()}.txt`;
        fs.writeFileSync(path.join(__dirname, fname), log, 'utf8');
        const lc = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (lc?.isTextBased()) await lc.send({ content: `🗑️ Salon supprimé : **${interaction.channel.name}** par **${interaction.user.tag}**`, files: [new AttachmentBuilder(path.join(__dirname, fname))] });
        fs.unlinkSync(path.join(__dirname, fname));
        await interaction.reply({ content: '✅ Salon supprimé.', ephemeral: true });
        return interaction.channel.delete().catch(() => { });
    }

    // Donation
    if (interaction.isButton() && id === 'open_donation_modal') {
        const modal = new ModalBuilder().setCustomId('donation_modal').setTitle('Proposer un don à la banque')
            .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('donation_amount').setLabel('Montant (aUEC)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('donation_screenshot').setLabel('URL capture d’écran').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10), screenshot = interaction.fields.getTextInputValue('donation_screenshot');
        if (isNaN(montant) || montant <= 0 || !screenshot) return interaction.reply({ content: '❌ Don invalide.', ephemeral: true });
        const b = loadBank(); b.total += montant; b.donateurs[interaction.user.id] = (b.donateurs[interaction.user.id] || 0) + montant; b.transactions.push({ userId: interaction.user.id, username: interaction.user.username, amount: montant, screenshot, timestamp: new Date().toISOString() }); saveBank(b);
        const bch = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null);
        if (bch?.isTextBased()) { const mid = fs.readFileSync(BANK_MSG_ID_FILE, 'utf8').trim(); const m = await bch.messages.fetch(mid).catch(() => null); if (m) await m.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] }); }
        return interaction.reply({ content: `✅ Merci ! Tu as proposé **${formatAUEC(montant)}**, capture reçue.`, ephemeral: true });
    }

    // Événements interactions
    if (interaction.isButton() && ['join_event_', 'decline_event_', 'delete_event_'].some(pref => id.startsWith(pref))) {
        let ev = loadEvents(), idx = parseInt(id.split('_')[2], 10);
        if (!ev[idx]) return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        if (id.startsWith('join_event_')) { if (!ev[idx].participants.includes(interaction.user.id)) ev[idx].participants.push(interaction.user.id); interaction.reply({ content: '✅ Participation confirmée !', ephemeral: true }); }
        else if (id.startsWith('decline_event_')) { ev[idx].participants = ev[idx].participants.filter(u => u !== interaction.user.id); interaction.reply({ content: '🔴 Désinscription effectuée.', ephemeral: true }); }
        else if (id.startsWith('delete_event_')) { const ar = interaction.guild.roles.cache.find(r => r.name === 'E-5'); if (!ar || !interaction.member.roles.cache.has(ar.id)) return interaction.reply({ content: 'Permission refusée.', ephemeral: true }); ev.splice(idx, 1); await interaction.message.delete().catch(() => { }); interaction.reply({ content: 'Événement supprimé.', ephemeral: true }); }
        saveEvents(ev);
        const ech = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
        if (ech?.isTextBased()) { const eid = fs.readFileSync(EVENT_MSG_ID_FILE, 'utf8').trim(); const em = await ech.messages.fetch(eid).catch(() => null); if (em) await em.edit({ embeds: [buildEventsEmbed(ev)], components: [buildEventsRow()] }); }
    }
});

// Lancement du bot
client.login(process.env.DISCORD_TOKEN);
