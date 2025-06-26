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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// Préfixe pour commandes texte et salon banque
const PREFIX = process.env.PREFIX || '!';
const BANK_CHANNEL_ID = process.env.BANK_CHANNEL_ID;

// Chargement des commandes préfixées
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

// Gestion des commandes texte
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const [raw, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = client.commands.get(raw.toLowerCase());
    if (!command) return;
    try {
        await command.execute(message, args);
    } catch (err) {
        console.error(`Erreur commande ${raw}:`, err);
        await message.reply('❌ Une erreur est survenue lors de l’exécution de la commande.');
    }
});

// Utilitaires pour events.json
const EVENTS_PATH = path.join(__dirname, 'events.json');
function loadEvents() {
    try {
        return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
    } catch {
        fs.writeFileSync(EVENTS_PATH, '[]', 'utf8');
        return [];
    }
}
function saveEvents(events) {
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf8');
}

// Utilitaires pour banque
const BANK_CONFIG = {
    path: path.join(__dirname, 'banque.json'),
    msgIdFile: path.join(__dirname, 'bankmsg_id.txt')
};
function loadBank() {
    try {
        return JSON.parse(fs.readFileSync(BANK_CONFIG.path, 'utf8'));
    } catch {
        const init = { total: 0, transactions: [], donateurs: {} };
        fs.writeFileSync(BANK_CONFIG.path, JSON.stringify(init, null, 2), 'utf8');
        return init;
    }
}
function saveBank(data) {
    fs.writeFileSync(BANK_CONFIG.path, JSON.stringify(data, null, 2), 'utf8');
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

// READY
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // 1. Vérification de mise à jour
    const pkg = require('./package.json');
    const currentVersion = pkg.version;
    const versionFile = path.join(__dirname, 'lastversion.txt');
    let lastVersion = '';
    if (fs.existsSync(versionFile)) lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
    if (currentVersion !== lastVersion) {
        const ch = await client.channels.fetch(process.env.UPDATE_CHANNEL_ID).catch(() => null);
        if (ch && ch.isTextBased()) {
            let changelogText = '- Aucun changelog disponible.';
            const changelogFile = path.join(__dirname, 'changelog.json');
            if (fs.existsSync(changelogFile)) {
                const log = JSON.parse(fs.readFileSync(changelogFile, 'utf8'));
                changelogText = log[currentVersion] || changelogText;
            }
            const embed = new EmbedBuilder()
                .setTitle(`🔄 Mise à jour du bot : v${currentVersion}`)
                .setDescription(changelogText)
                .setColor(0xFFA500)
                .setTimestamp();
            await ch.send({ embeds: [embed] });
            fs.writeFileSync(versionFile, currentVersion, 'utf8');
        }
    }

    // 2. Boutons rôles initiaux
    const roleCh = await client.channels.fetch(process.env.ROLE_CHANNEL_ID).catch(() => null);
    if (roleCh && roleCh.isTextBased()) {
        const roleBtnFile = path.join(__dirname, 'role_button_id.txt');
        if (!fs.existsSync(roleBtnFile)) {
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
            fs.writeFileSync(roleBtnFile, msg.id, 'utf8');
        }
    }

    // 3. Message permanent Banque
    if (BANK_CHANNEL_ID) {
        const bankCh = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null);
        if (bankCh && bankCh.isTextBased()) {
            let msgId = '';
            if (fs.existsSync(BANK_CONFIG.msgIdFile)) msgId = fs.readFileSync(BANK_CONFIG.msgIdFile, 'utf8').trim();
            let msg;
            if (msgId) {
                msg = await bankCh.messages.fetch(msgId).catch(() => null);
            }
            if (!msg) {
                msg = await bankCh.send({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
                fs.writeFileSync(BANK_CONFIG.msgIdFile, msg.id, 'utf8');
            } else {
                await msg.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
            }
        }
    }
});

// Bienvenue
client.on(Events.GuildMemberAdd, async member => {
    const wCh = await member.guild.channels.fetch(process.env.WELCOME_CHANNEL_ID).catch(() => null);
    if (wCh && wCh.isTextBased()) {
        const embed = new EmbedBuilder()
            .setTitle(`👋 Bienvenue, ${member.user.username} !`)
            .setDescription(`Bienvenue sur **${member.guild.name}** ! Pense à lire les règles.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setColor(0x00AE86)
            .setTimestamp();
        wCh.send({ embeds: [embed] });
    }
});

// Interactions (boutons, modals, events)
client.on(Events.InteractionCreate, async interaction => {
    const id = interaction.customId;
    // Salon privé
    if (interaction.isButton() && ['open_ticket', 'open_candidature', 'open_ambassade'].includes(id)) {
        const member = interaction.member;
        const guild = interaction.guild;
        const name = `${id.replace('open_', '')}-${member.user.username}`.toLowerCase();
        const visibleRoles = {
            open_ticket: ['Administrator', 'moderator'],
            open_candidature: ['Administrator', 'recruiter'],
            open_ambassade: ['Administrator', 'moderator']
        }[id] || [];
        const overwrites = [
            { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
            { id: member.id, allow: ['ViewChannel', 'SendMessages'] },
            ...visibleRoles.map(rn => guild.roles.cache.find(r => r.name.toLowerCase() === rn.toLowerCase()))
                .filter(r => r).map(r => ({ id: r.id, allow: ['ViewChannel', 'SendMessages'] }))
        ];
        const channel = await guild.channels.create({ name, type: 0, permissionOverwrites: overwrites });
        const btn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('delete_channel').setLabel('🗑️ Supprimer le salon').setStyle(ButtonStyle.Danger)
        );
        await channel.send({ content: `<@${member.id}>`, components: [btn] });
        return interaction.reply({ content: '✅ Salon créé.', ephemeral: true });
    }
    // Delete channel
    if (interaction.isButton() && id === 'delete_channel') {
        const allowed = ['Administrator', 'moderator', 'recruiter'];
        if (!interaction.member.roles.cache.some(r => allowed.includes(r.name)))
            return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
        const msgs = await interaction.channel.messages.fetch({ limit: 100 });
        const lines = msgs.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
        const file = `log-${interaction.channel.name}.txt`;
        fs.writeFileSync(file, lines, 'utf8');
        const logCh = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
        if (logCh && logCh.isTextBased())
            await logCh.send({ content: `🗑️ Salon supprimé : ${interaction.channel.name} par ${interaction.user.tag}`, files: [new AttachmentBuilder(file)] });
        fs.unlinkSync(file);
        await interaction.reply({ content: 'Salon supprimé.', ephemeral: true });
        return interaction.channel.delete().catch(console.error);
    }
    // Banque donation modal
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
    // Donation submission
    if (interaction.isModalSubmit() && interaction.customId === 'donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10);
        const screenshot = interaction.fields.getTextInputValue('donation_screenshot');
        if (isNaN(montant) || montant <= 0 || !screenshot)
            return interaction.reply({ content: '❌ Don invalide.', ephemeral: true });
        const bank = loadBank();
        bank.total += montant;
        bank.donateurs[interaction.user.id] = (bank.donateurs[interaction.user.id] || 0) + montant;
        bank.transactions.push({ userId: interaction.user.id, username: interaction.user.username, amount: montant, screenshot, timestamp: new Date().toISOString() });
        saveBank(bank);
        // Update embedded message
        const ch = await client.channels.fetch(BANK_CHANNEL_ID).catch(() => null);
        if (ch && ch.isTextBased()) {
            const mid = fs.readFileSync(BANK_CONFIG.msgIdFile, 'utf8').trim();
            const msg = await ch.messages.fetch(mid).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildBankEmbed()], components: [buildDonationRow()] });
        }
        return interaction.reply({ content: `✅ Merci ! Tu as proposé **${formatAUEC(montant)}**, capture reçue.`, ephemeral: true });
    }
    // Events buttons
    if (interaction.isButton() && id.startsWith('join_event_')) {
        const idx = parseInt(id.split('_')[2], 10);
        const events = loadEvents();
        if (!events[idx]) return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        if (!events[idx].participants.includes(interaction.user.id)) {
            events[idx].participants.push(interaction.user.id);
            saveEvents(events);
        }
        return interaction.reply({ content: '✅ Participation confirmée !', ephemeral: true });
    }
    if (interaction.isButton() && id.startsWith('decline_event_')) {
        const idx = parseInt(id.split('_')[2], 10);
        const events = loadEvents();
        if (!events[idx]) return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        events[idx].participants = events[idx].participants.filter(u => u !== interaction.user.id);
        saveEvents(events);
        return interaction.reply({ content: '🔴 Désinscription effectuée.', ephemeral: true });
    }
    if (interaction.isButton() && id.startsWith('delete_event_')) {
        const idx = parseInt(id.split('_')[2], 10);
        const adminRole = interaction.guild.roles.cache.find(r => r.name === 'E-5');
        if (!adminRole || !interaction.member.roles.cache.has(adminRole.id))
            return interaction.reply({ content: 'Permission refusée.', ephemeral: true });
        const events = loadEvents();
        if (!events[idx]) return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        events.splice(idx, 1);
        saveEvents(events);
        await interaction.message.delete().catch(console.error);
        return interaction.reply({ content: 'Événement supprimé.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);