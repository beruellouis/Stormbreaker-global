// index.js complet et fusionné
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

// Chargement des commandes
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            const command = require(path.join(commandsPath, file));
            client.commands.set(command.name, command);
        });
}

// READY
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // MISE À JOUR
    const pkg = require('./package.json');
    const currentVersion = pkg.version;
    const versionFile = 'lastversion.txt';
    let lastVersion = '';

    if (fs.existsSync(versionFile)) {
        lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
    }

    if (currentVersion !== lastVersion) {
        const updateChannelId = process.env.UPDATE_CHANNEL_ID;
        const channel = await client.channels.fetch(updateChannelId).catch(() => null);
        if (channel && channel.isTextBased()) {
            const changelogFile = 'changelog.json';
            let changelogText = '- Aucun changelog disponible.';
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
            fs.writeFileSync(versionFile, currentVersion);
        }
    }

    // BOUTONS RÔLES INITIAUX
    const roleChannelId = process.env.ROLE_CHANNEL_ID;
    const roleChannel = await client.channels.fetch(roleChannelId).catch(() => null);
    if (!roleChannel || !roleChannel.isTextBased()) return;

    const roleButtonFile = 'role_button_id.txt';
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
        fs.writeFileSync(roleButtonFile, msg.id);
    }
});

// Message de bienvenue
client.on(Events.GuildMemberAdd, async member => {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue, ${member.user.username} !`)
        .setDescription(`Bienvenue sur **${member.guild.name}** ! Pense à lire les règles.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor(0x00AE86)
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// Toutes les interactions fusionnées
client.on(Events.InteractionCreate, async interaction => {
    const id = interaction.customId;

    // === Boutons d'accès salon privé ===
    if (interaction.isButton() && ['open_ticket', 'open_candidature', 'open_ambassade'].includes(id)) {
        const member = interaction.member;
        const guild = interaction.guild;
        const salonName = `${id.replace('open_', '')}-${member.user.username}`;
        const visibleRoles = {
            open_ticket: ['Administrator', 'moderator'],
            open_candidature: ['Administrator', 'recruiter'],
            open_ambassade: ['Administrator', 'moderator']
        }[id];

        const overwrites = [
            { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
            { id: member.id, allow: ['ViewChannel', 'SendMessages'] },
            ...visibleRoles.map(roleName => {
                const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
                return role ? { id: role.id, allow: ['ViewChannel', 'SendMessages'] } : null;
            }).filter(Boolean)
        ];

        const salon = await guild.channels.create({
            name: salonName.toLowerCase(),
            type: 0,
            permissionOverwrites: overwrites,
            parent: null
        });

        const btn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('delete_channel').setLabel('🗑️ Supprimer le salon').setStyle(ButtonStyle.Danger)
        );

        await salon.send({ content: `<@${member.id}>`, components: [btn] });
        return interaction.reply({ content: '✅ Salon créé.', ephemeral: true });
    }

    // === Supprimer un salon avec logs ===
    if (interaction.isButton() && id === 'delete_channel') {
        const allowedRoles = ['Administrator', 'moderator', 'recruiter'];
        const hasPermission = interaction.member.roles.cache.some(role => allowedRoles.includes(role.name));

        if (!hasPermission) {
            return interaction.reply({ content: '❌ Tu n’as pas la permission.', ephemeral: true });
        }

        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const lines = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
        const fileName = `log-${interaction.channel.name}.txt`;
        fs.writeFileSync(fileName, lines);

        const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
            const file = new AttachmentBuilder(fileName);
            await logChannel.send({ content: `🗑️ Salon supprimé : ${interaction.channel.name} par ${interaction.user.tag}`, files: [file] });
        }

        fs.unlinkSync(fileName);
        await interaction.reply({ content: 'Salon supprimé.', ephemeral: true });
        await interaction.channel.delete().catch(console.error);
    }

    // === Don via modal ===
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
        const filePath = 'banque.json';
        const banque = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : { total: 0, donateurs: {}, transactions: [] };

        banque.total += montant;
        banque.donateurs[interaction.user.id] = (banque.donateurs[interaction.user.id] || 0) + montant;
        banque.transactions.push({ userId: interaction.user.id, username: interaction.user.username, amount: montant, timestamp: new Date().toISOString() });

        fs.writeFileSync(filePath, JSON.stringify(banque, null, 2));
        return interaction.reply({ content: `Merci pour ton don de ${montant.toLocaleString()} aUEC !`, ephemeral: true });
    }

    // === Gestion des événements
    if (interaction.isButton() && id.startsWith('join_event_')) {
        const idx = parseInt(id.split('_')[2]);
        const eventsPath = 'events.json';
        const events = JSON.parse(fs.readFileSync(eventsPath));
        if (!events[idx]) return interaction.reply({ content: 'Evénement introuvable.', ephemeral: true });
        if (!events[idx].participants.includes(interaction.user.id)) {
            events[idx].participants.push(interaction.user.id);
            fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
        }
        return interaction.reply({ content: 'Participation confirmée !', ephemeral: true });
    }

    if (interaction.isButton() && id.startsWith('decline_event_')) {
        const idx = parseInt(id.split('_')[2]);
        const eventsPath = 'events.json';
        const events = JSON.parse(fs.readFileSync(eventsPath));
        if (!events[idx]) return interaction.reply({ content: 'Evénement introuvable.', ephemeral: true });
        events[idx].participants = events[idx].participants.filter(u => u !== interaction.user.id);
        fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
        return interaction.reply({
            content: 'Tu es retiré de l'événement.', ephemeral: true });
    }

    if (interaction.isButton() && id.startsWith('delete_event_')) {
            const idx = parseInt(id.split('_')[2]);
            const adminRole = interaction.guild.roles.cache.find(r => r.name === 'E-5');
            if (!adminRole || !interaction.member.roles.cache.has(adminRole.id)) {
                return interaction.reply({ content: 'Permission refusée.', ephemeral: true });
            }
            const eventsPath = 'events.json';
            const events = JSON.parse(fs.readFileSync(eventsPath));
            if (!events[idx]) return interaction.reply({ content: 'Evénement introuvable.', ephemeral: true });
            events.splice(idx, 1);
            fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
            await interaction.message.delete().catch(console.error);
            return interaction.reply({ content: 'Evénement supprimé.', ephemeral: true });
        }
    });

client.login(process.env.DISCORD_TOKEN);
