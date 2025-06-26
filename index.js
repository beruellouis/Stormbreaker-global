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

// Variables d'environnement
const PREFIX = process.env.PREFIX || '!';
const UPDATE_CHANNEL_ID = process.env.UPDATE_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const ROLE_CHANNEL_ID = process.env.ROLE_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BANK_CHANNEL_ID = process.env.BANK_CHANNEL_ID;
const EVENT_CHANNEL_ID = process.env.EVENT_CHANNEL_ID; // à ajouter dans .env

// Fichiers stockés
const EVENTS_FILE = path.join(__dirname, 'events.json');
const EVENT_MSG_ID_FILE = path.join(__dirname, 'eventmsg_id.txt');
const BANK_FILE = path.join(__dirname, 'banque.json');
const BANK_MSG_ID_FILE = path.join(__dirname, 'bankmsg_id.txt');

// Chargement des commandes depuis /commands
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'))
        .forEach(file => {
            const cmd = require(path.join(commandsPath, file));
            if (cmd.name && typeof cmd.execute === 'function') {
                client.commands.set(cmd.name, cmd);
            }
        });
}

// Handler pour commandes préfixées
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

// --- EVENTS UTILITAIRES ---
function loadEvents() {
    try { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')); }
    catch { fs.writeFileSync(EVENTS_FILE, '[]', 'utf8'); return []; }
}
function saveEvents(events) {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
}
function buildEventsEmbed(events) {
    if (events.length === 0) {
        return new EmbedBuilder()
            .setTitle('📋 Événements Stormbreaker')
            .setDescription('Aucun événement pour l’instant.')
            .setColor(0x3498DB)
            .setTimestamp();
    }
    const fields = events.map((e, i) => {
        const parts = (e.participants || []).map(u => `<@${u}>`).join(', ') || 'Personne';
        const non = (e.nonParticipants || []).map(u => `<@${u}>`).join(', ') || 'Aucun refus';
        return {
            name: `📌 [${i}] ${e.title} — ${e.date}`,
            value: `${e.description}\n👥 Participants: ${parts}\n🙅 Refus: ${non}`
        };
    });
    return new EmbedBuilder()
        .setTitle('📋 Événements Stormbreaker')
        .addFields(fields)
        .setColor(0x3498DB)
        .setTimestamp();
}
function buildEventsRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('refresh_events')
            .setLabel('🔄 Rafraîchir')
            .setStyle(ButtonStyle.Secondary)
    );
}

// --- BANQUE UTILITAIRES ---
function loadBank() {
    try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); }
    catch { const init = { total: 0, transactions: [], donateurs: {} }; fs.writeFileSync(BANK_FILE, JSON.stringify(init, null, 2), 'utf8'); return init; }
}
function saveBank(bank) {
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2), 'utf8');
}
function formatAUEC(amount) {
    return `${Number(amount).toLocaleString()} aUEC`;
}
function buildBankEmbed() {
    const bank = loadBank();
    const top = Object.entries(bank.donateurs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, amt], i) => `${i + 1}. <@${id}> — ${formatAUEC(amt)}`)
        .join('\n') || 'Aucun donateur.';
    return new EmbedBuilder()
        .setTitle('🏦 Banque Stormbreaker')
        .setDescription(`💰 Total actuel : **${formatAUEC(bank.total)}**\n\n👑 Top donateurs :\n${top}`)
        .setColor(0x2ecc71)
        .setTimestamp();
}
function buildDonationRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('open_donation_modal')
            .setLabel('💸 Proposer un don')
            .setStyle(ButtonStyle.Primary)
    );
}

// --- READY ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // 1. Mise à jour automatique
    const pkg = require('./package.json');
    const verFile = path.join(__dirname, 'lastversion.txt');
    let last = '';
    if (fs.existsSync(verFile)) last = fs.readFileSync(verFile, 'utf8').trim();
    if (pkg.version !== last) {
        const ch = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
        if (ch?.isTextBased()) {
            let changelogText = '- Aucun changelog disponible.';
            const logF = path.join(__dirname, 'changelog.json');
            if (fs.existsSync(logF)) {
                const log = JSON.parse(fs.readFileSync(logF, 'utf8'));
                changelogText = log[pkg.version] || changelogText;
            }
            const embed = new EmbedBuilder()
                .setTitle(`🔄 Mise à jour du bot : v${pkg.version}`)
                .setDescription(changelogText)
                .setColor(0xFFA500)
                .setTimestamp();
            await ch.send({ embeds: [embed] });
            fs.writeFileSync(verFile, pkg.version, 'utf8');
        }
    }

    // 2. Boutons rôles initiaux
    const roleCh = await client.channels.fetch(ROLE_CHANNEL_ID).catch(() => null);
    if (roleCh?.isTextBased()) {
        const btnF = path.join(__dirname, 'role_button_id.txt');
        if (!fs.existsSync(btnF)) {
            const embed = new EmbedBuilder()
                .setTitle('🎭 Choisis ton orientation')
                .setDescription('Appuie sur un bouton ci-dessous pour accéder à un salon privé')
                .setColor(0x3498DB);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('open_candidature').setLabel('📄 Candidature').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('open_ambassade').setLabel('🤝 Ambassade').setStyle(ButtonStyle.Secondary)
            );
            const msg = await roleCh.send({ embeds: [embed], components: [row] });
            fs.writeFileSync(btnF, msg.id, 'utf8');
        }
    }

    // 3. Message Banque permanent
    if (BANK_CHANNEL_ID) {
        const bankCh = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null);
        if (bankCh?.isTextBased()) {
            let mid = '';
            if (fs.existsSync(BANK_MSG_ID_FILE)) mid = fs.readFileSync(BANK_MSG_ID_FILE, 'utf8').trim();
            let msg = mid ? await bankCh.messages.fetch(mid).catch(() => null) : null;
            if (!msg) {
                msg = await bankCh.send({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
                fs.writeFileSync(BANK_MSG_ID_FILE, msg.id, 'utf8');
            } else {
                await msg.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
            }
        }
    }

    // 4. Message Événements permanent
    if (EVENT_CHANNEL_ID) {
        const evCh = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
        if (evCh?.isTextBased()) {
            let eid = '';
            if (fs.existsSync(EVENT_MSG_ID_FILE)) eid = fs.readFileSync(EVENT_MSG_ID_FILE, 'utf8').trim();
            let emsg = eid ? await evCh.messages.fetch(eid).catch(() => null) : null;
            const embed = buildEventsEmbed(loadEvents());
            const row = buildEventsRow();
            if (!emsg) {
                emsg = await evCh.send({ embeds: [embed], components: [row] });
                fs.writeFileSync(EVENT_MSG_ID_FILE, emsg.id, 'utf8');
            } else {
                await emsg.edit({ embeds: [embed], components: [row] });
            }
        }
    }
});

// --- Bienvenue ---
client.on(Events.GuildMemberAdd, async member => {
    const wCh = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (wCh?.isTextBased()) {
        const embed = new EmbedBuilder()
            .setTitle(`👋 Bienvenue, ${member.user.username} !`)
            .setDescription(`Bienvenue sur **${member.guild.name}** ! Pense à lire les règles.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setColor(0x00AE86)
            .setTimestamp();
        await wCh.send({ embeds: [embed] });
    }
});

// --- InteractionCreate ---
client.on(Events.InteractionCreate, async interaction => {
    const id = interaction.customId;

    // Gestion des salons privés & suppression (inchangée)...

    // Donation modal
    if (interaction.isButton() && id === 'open_donation_modal') {
        const modal = new ModalBuilder()
            .setCustomId('donation_modal')
            .setTitle('Proposer un don à la banque')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('donation_amount').setLabel('Montant (aUEC)').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('donation_screenshot').setLabel('URL capture d’écran').setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
        return interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10);
        const screenshot = interaction.fields.getTextInputValue('donation_screenshot');
        if (isNaN(montant) || montant <= 0 || !screenshot) {
            return interaction.reply({ content: '❌ Don invalide.', ephemeral: true });
        }
        // Mise à jour banque
        const bank = loadBank();
        bank.total += montant;
        bank.donateurs[interaction.user.id] = (bank.donateurs[interaction.user.id] || 0) + montant;
        bank.transactions.push({ userId: interaction.user.id, username: interaction.user.username, amount: montant, screenshot, timestamp: new Date().toISOString() });
        saveBank(bank);
        // Edit permanent bank message
        const bCh = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null);
        if (bCh?.isTextBased()) {
            const mid = fs.readFileSync(BANK_MSG_ID_FILE, 'utf8').trim();
            const msg = await bCh.messages.fetch(mid).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
        }
        return interaction.reply({ content: `✅ Merci ! Tu as proposé **${formatAUEC(montant)}**, capture reçue.`, ephemeral: true });
    }

    // Événements interactions
    const isEvtBtn = ['join_event_', 'decline_event_', 'delete_event_'];
    if (interaction.isButton() && isEvtBtn.some(pref => id.startsWith(pref))) {
        let events = loadEvents();
        const idx = parseInt(id.split('_')[2], 10);
        if (!events[idx]) {
            return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        }
        switch (true) {
            case id.startsWith('join_event_'):
                if (!events[idx].participants.includes(interaction.user.id)) {
                    events[idx].participants.push(interaction.user.id);
                }
                interaction.reply({ content: '✅ Participation confirmée !', ephemeral: true });
                break;
            case id.startsWith('decline_event_'):
                events[idx].participants = events[idx].participants.filter(u => u !== interaction.user.id);
                interaction.reply({ content: '🔴 Désinscription effectuée.', ephemeral: true });
                break;
            case id.startsWith('delete_event_'):
                const adminR = interaction.guild.roles.cache.find(r => r.name === 'E-5');
                if (!adminR || !interaction.member.roles.cache.has(adminR.id)) {
                    return interaction.reply({ content: 'Permission refusée.', ephemeral: true });
                }
                events.splice(idx, 1);
                await interaction.message.delete().catch(() => { });
                interaction.reply({ content: 'Événement supprimé.', ephemeral: true });
                break;
        }
        saveEvents(events);
        // Edit permanent events message
        const evCh = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
        if (evCh?.isTextBased()) {
            const eid = fs.readFileSync(EVENT_MSG_ID_FILE, 'utf8').trim();
            const emsg = await evCh.messages.fetch(eid).catch(() => null);
            if (emsg) await emsg.edit({ embeds: [buildEventsEmbed(events)], components: [buildEventsRow()] });
        }
    }
});

// Connection
client.login(process.env.DISCORD_TOKEN);
