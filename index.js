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
    ChannelType,
    PermissionsBitField
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

// READY + détection de mise à jour de version
client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    const updateChannelId = process.env.UPDATE_CHANNEL_ID;
    const pkg = require(path.join(__dirname, 'package.json'));
    const currentVersion = pkg.version;
    const versionFile = path.join(__dirname, 'lastversion.txt');
    let lastVersion = '';

    console.log(`📦 Version actuelle : ${currentVersion}`);

    if (fs.existsSync(versionFile)) {
        lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
        console.log(`📄 Version précédente détectée : ${lastVersion}`);
    } else {
        console.log('📄 Aucune version précédente détectée.');
    }

    if (currentVersion !== lastVersion) {
        const channel = await client.channels.fetch(updateChannelId).catch(err => {
            console.error('❌ Erreur récupération du salon :', err);
            return null;
        });

        if (!channel || !channel.isTextBased()) return;

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
        fs.writeFileSync(versionFile, currentVersion);
    }
});

// Message de bienvenue avec boutons
client.on(Events.GuildMemberAdd, async member => {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue, ${member.user.username} !`)
        .setDescription("Bienvenue sur **" + member.guild.name + "** !\n\nChoisissez une des options ci-dessous pour débuter votre intégration :")
        .setColor(0x00AE86)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_demande')
            .setLabel('🎫 Ticket')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('candidature_demande')
            .setLabel('📄 Candidature')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ambassade_demande')
            .setLabel('🤝 Ambassade')
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
});

// Commandes texte
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (!command) return;
    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(error);
        message.reply('❌ Une erreur est survenue.');
    }
});

// Interaction : boutons + modals + événements
client.on(Events.InteractionCreate, async interaction => {
    // Création de salon privé (ticket, ambassade, candidature)
    const salonTypes = {
        'ticket_demande': { name: 'ticket', roles: ['Administrator', 'moderator'] },
        'candidature_demande': { name: 'candidature', roles: ['recruiter'] },
        'ambassade_demande': { name: 'ambassade', roles: ['Administrator', 'moderator'] }
    };

    if (interaction.isButton() && salonTypes[interaction.customId]) {
        const { name, roles } = salonTypes[interaction.customId];
        const channelName = `${name}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, '');

        const overwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            },
            ...roles.map(roleName => {
                const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
                return role ? {
                    id: role.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                } : null;
            }).filter(Boolean)
        ];

        const newChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: overwrites,
            reason: `Création de salon ${name} pour ${interaction.user.tag}`
        });

        const deleteButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('delete_private_channel')
                .setLabel('❌ Supprimer ce salon')
                .setStyle(ButtonStyle.Danger)
        );

        await newChannel.send({
            content: `Bienvenue ${interaction.user}, vous pouvez discuter ici.`,
            components: [deleteButton]
        });

        return interaction.reply({ content: `✅ Salon ${channelName} créé.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'delete_private_channel') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const allowedRoles = ['Administrator', 'moderator', 'recruiter'];
        const hasAccess = member.roles.cache.some(r => allowedRoles.includes(r.name));

        if (!hasAccess) {
            return interaction.reply({ content: '❌ Vous n\'avez pas la permission de supprimer ce salon.', ephemeral: true });
        }

        await interaction.channel.delete().catch(console.error);
    }
});

client.login(process.env.DISCORD_TOKEN);

