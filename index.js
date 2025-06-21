// index.js complet avec retranscription lors de la suppression d'un salon

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
    TextInputStyle
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

client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

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

    const roleChannelId = process.env.ROLE_CHANNEL_ID;
    const roleChannel = await client.channels.fetch(roleChannelId).catch(() => null);
    if (!roleChannel || !roleChannel.isTextBased()) return;

    const roleButtonFile = 'role_button_id.txt';
    if (!fs.existsSync(roleButtonFile)) {
        const embed = new EmbedBuilder()
            .setTitle('🎝️ Choisis ton orientation')
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

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        const id = interaction.customId;
        const guild = interaction.guild;
        const member = interaction.member;

        let salonName = '';
        let visibleRoles = [];

        if (id === 'open_ticket') {
            salonName = `ticket-${member.user.username}`;
            visibleRoles = ['Administrator', 'moderator'];
        } else if (id === 'open_candidature') {
            salonName = `candidature-${member.user.username}`;
            visibleRoles = ['Administrator', 'recruiter'];
        } else if (id === 'open_ambassade') {
            salonName = `ambassade-${member.user.username}`;
            visibleRoles = ['Administrator', 'moderator'];
        }

        if (salonName) {
            const everyone = guild.roles.everyone.id;
            const overwrites = [
                { id: everyone, deny: ['ViewChannel'] },
                { id: member.id, allow: ['ViewChannel', 'SendMessages'] }
            ];

            visibleRoles.forEach(roleName => {
                const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
                if (role) overwrites.push({ id: role.id, allow: ['ViewChannel', 'SendMessages'] });
            });

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

        if (id === 'delete_channel') {
            const allowedRoles = ['Administrator', 'moderator', 'recruiter'];
            const hasPermission = interaction.member.roles.cache.some(role =>
                allowedRoles.includes(role.name)
            );

            if (!hasPermission) {
                return interaction.reply({ content: '❌ Tu n’as pas la permission de supprimer ce salon.', ephemeral: true });
            }

            await interaction.reply({ content: '🗑️ Salon supprimé.', ephemeral: true });

            // Transcription
            const logChannelId = process.env.LOG_CHANNEL_ID;
            const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);

            if (logChannel && logChannel.isTextBased()) {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const content = messages
                    .map(msg => `[${msg.createdAt.toISOString()}] ${msg.author.username}: ${msg.content}`)
                    .reverse()
                    .join('\n');

                const fileName = `${interaction.channel.name}-${Date.now()}.txt`;
                fs.writeFileSync(fileName, content || 'Aucun message dans ce salon.');

                await logChannel.send({
                    content: `📄 Salon supprimé par ${interaction.user.tag} : **${interaction.channel.name}**`,
                    files: [fileName]
                });

                fs.unlinkSync(fileName);
            }

            await interaction.channel.delete().catch(console.error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

