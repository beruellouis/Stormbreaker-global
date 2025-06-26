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

// Préfixe pour les commandes textuelles
const PREFIX = process.env.PREFIX || '!';

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

// Gestion des commandes préfixées (!help, etc.)
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [rawName, ...args] = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);
    const name = rawName.toLowerCase();
    const command = client.commands.get(name);
    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (err) {
        console.error(`Erreur exécution commande ${name} :`, err);
        message.reply('❌ Une erreur est survenue lors de l’exécution de la commande.');
    }
});

// Utilitaires pour events.json
const EVENTS_PATH = path.join(__dirname, 'events.json');
function loadEvents() {
    try {
        const raw = fs.readFileSync(EVENTS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('⚠️ Impossible de parser events.json, réinitialisation :', err.message);
        fs.writeFileSync(EVENTS_PATH, '[]', 'utf8');
        return [];
    }
}
function saveEvents(events) {
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf8');
}

// READY
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // Vérification de mise à jour
    const pkg = require('./package.json');
    const currentVersion = pkg.version;
    const versionFile = path.join(__dirname, 'lastversion.txt');
    let lastVersion = '';

    if (fs.existsSync(versionFile)) {
        lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
    }

    if (currentVersion !== lastVersion) {
        const channel = await client.channels.fetch(process.env.UPDATE_CHANNEL_ID).catch(() => null);
        if (channel && channel.isTextBased()) {
            let changelogText = '- Aucun changelog disponible.';
            const changelogFile = path.join(__dirname, 'changelog.json');
            if (fs.existsSync(changelogFile)) {
                const changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8'));
                changelogText = changelog[currentVersion] || changelogText;
            }
            const embed = new EmbedBuilder()
                .setTitle(`🔄 Mise à jour du bot : v${currentVersion}`)
                .setDescription(changelogText)
                .setColor(0xFFA500)
                .setTimestamp();
            await channel.send({ embeds: [embed] });
            fs.writeFileSync(versionFile, currentVersion, 'utf8');
        }
    }

    // Boutons rôles initiaux
    const roleChannel = await client.channels.fetch(process.env.ROLE_CHANNEL_ID).catch(() => null);
    if (!roleChannel || !roleChannel.isTextBased()) return;
    const roleButtonFile = path.join(__dirname, 'role_button_id.txt');
    if (!fs.existsSync(roleButtonFile)) {
        const embed = new EmbedBuilder()
            .setTitle('🎭 Choisis ton orientation')
            .setDescription('Appuie sur un bouton ci-dessous pour accéder à un salon privé')
            .setColor(0x3498DB);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('open_candidature').setLabel('📄 Candidature').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('open_ambassade').setLabel('🤝 Ambassade').setStyle(ButtonStyle.Secondary)
        );

        const msg = await roleChannel.send({ embeds: [embed], components: [row] });
        fs.writeFileSync(roleButtonFile, msg.id, 'utf8');
    }
});

// Bienvenue
client.on(Events.GuildMemberAdd, async (member) => {
    const channel = await member.guild.channels.fetch(process.env.WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue, ${member.user.username} !`)
        .setDescription(`Bienvenue sur **${member.guild.name}** ! Pense à lire les règles.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor(0x00AE86)
        .setTimestamp();
    channel.send({ embeds: [embed] });
});

// Interactions (boutons, modals)
client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.customId;

    // Accès salons privés
    if (interaction.isButton() && ['open_ticket', 'open_candidature', 'open_ambassade'].includes(id)) {
        const member = interaction.member;
        const guild = interaction.guild;
        const name = `${id.replace('open_', '')}-${member.user.username}`.toLowerCase();
        const visibleRolesMap = {
            open_ticket: ['Administrator', 'moderator'],
            open_candidature: ['Administrator', 'recruiter'],
            open_ambassade: ['Administrator', 'moderator']
        };
        const roles = visibleRolesMap[id] || [];
        const overwrites = [
            { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
            { id: member.id, allow: ['ViewChannel', 'SendMessages'] },
            ...roles.map(r => guild.roles.cache.find(x => x.name.toLowerCase() === r.toLowerCase()))
                .filter(Boolean)
                .map(r => ({ id: r.id, allow: ['ViewChannel', 'SendMessages'] }))
        ];
        const channel = await guild.channels.create({ name, type: 0, permissionOverwrites: overwrites });
        const btn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('delete_channel').setLabel('🗑️ Supprimer le salon').setStyle(ButtonStyle.Danger)
        );
        await channel.send({ content: `<@${member.id}>`, components: [btn] });
        return interaction.reply({ content: '✅ Salon créé.', ephemeral: true });
    }

    // Supprimer salon
    if (interaction.isButton() && id === 'delete_channel') {
        const allowed = ['Administrator', 'moderator', 'recruiter'];
        const ok = interaction.member.roles.cache.some(r => allowed.includes(r.name));
        if (!ok) return interaction.reply({ content: '❌ Tu n’as pas la permission.', ephemeral: true });
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const lines = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
        const fileName = `log-${interaction.channel.name}.txt`;
        fs.writeFileSync(fileName, lines, 'utf8');
        const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send({ content: `🗑️ Salon supprimé : ${interaction.channel.name} par ${interaction.user.tag}`, files: [new AttachmentBuilder(fileName)] });
        }
        fs.unlinkSync(fileName);
        await interaction.reply({ content: 'Salon supprimé.', ephemeral: true });
        return interaction.channel.delete().catch(console.error);
    }

    // Modal de don
    if (interaction.isButton() && id === 'open_donation_modal') {
        const modal = new ModalBuilder()
            .setCustomId('custom_donation_modal')
            .setTitle('Faire un don à Stormbreaker')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('donation_amount')
                        .setLabel('Montant à donner (en AUEC)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && id === 'custom_donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10);
        if (isNaN(montant) || montant <= 0) {
            return interaction.reply({ content: 'Montant invalide.', ephemeral: true });
        }
        const filePath = path.join(__dirname, 'banque.json');
        const banque = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : { total: 0, donateurs: {}, transactions: [] };
        banque.total += montant;
        banque.donateurs[interaction.user.id] = (banque.donateurs[interaction.user.id] || 0) + montant;
        banque.transactions.push({ userId: interaction.user.id, username: interaction.user.username, amount: montant, timestamp: new Date().toISOString() });
        fs.writeFileSync(filePath, JSON.stringify(banque, null, 2), 'utf8');
        return interaction.reply({ content: `Merci pour ton don de ${montant.toLocaleString()} aUEC !`, ephemeral: true });
    }

    // Gestion des événements
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
        if (!adminRole || !interaction.member.roles.cache.has(adminRole.id)) {
            return interaction.reply({ content: 'Permission refusée.', ephemeral: true });
        }
        const events = loadEvents();
        if (!events[idx]) return interaction.reply({ content: '⚠️ Événement introuvable.', ephemeral: true });
        events.splice(idx, 1);
        saveEvents(events);
        await interaction.message.delete().catch(console.error);
        return interaction.reply({ content: 'Événement supprimé.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
