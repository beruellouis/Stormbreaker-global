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

// Fonction de log
function logAction(action) {
    const logPath = path.join(__dirname, 'logs.json');
    let logs = [];
    if (fs.existsSync(logPath)) {
        logs = JSON.parse(fs.readFileSync(logPath));
    }
    logs.push({ timestamp: new Date().toISOString(), action });
    if (logs.length > 100) logs.shift();
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

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

client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    const updateChannelId = process.env.UPDATE_CHANNEL_ID;
    const pkg = require(path.join(__dirname, 'package.json'));
    const currentVersion = pkg.version;
    const versionFile = path.join(__dirname, 'lastversion.txt');
    let lastVersion = '';

    if (fs.existsSync(versionFile)) {
        lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
    }

    if (currentVersion !== lastVersion) {
        const channel = await client.channels.fetch(updateChannelId).catch(() => null);
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
        }
        fs.writeFileSync(versionFile, currentVersion);
    }
});

client.on(Events.GuildMemberAdd, async member => {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue, ${member.user.username} !`)
        .setDescription(`Bienvenue sur **${member.guild.name}**.`)
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
    const id = interaction.customId;
    const eventsPath = path.join(__dirname, 'events.json');
    const events = fs.existsSync(eventsPath) ? JSON.parse(fs.readFileSync(eventsPath)) : [];

    if (interaction.isButton() && id === 'open_donation_modal') {
        const modal = new ModalBuilder()
            .setCustomId('custom_donation_modal')
            .setTitle('Faire un don à Stormbreaker');
        const input = new TextInputBuilder()
            .setCustomId('donation_amount')
            .setLabel('Montant (AUEC)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && id === 'custom_donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10);
        if (isNaN(montant) || montant <= 0) return interaction.reply({ content: 'Montant invalide.', ephemeral: true });

        const bp = path.join(__dirname, 'banque.json');
        const banque = JSON.parse(fs.readFileSync(bp));
        banque.total = (banque.total || 0) + montant;
        banque.donateurs = banque.donateurs || {};
        banque.transactions = banque.transactions || [];
        const uid = interaction.user.id;
        banque.donateurs[uid] = (banque.donateurs[uid] || 0) + montant;
        banque.transactions.push({ userId: uid, username: interaction.user.username, amount: montant, timestamp: new Date().toISOString() });
        fs.writeFileSync(bp, JSON.stringify(banque, null, 2));

        logAction(`${interaction.user.tag} a fait un don de ${montant} aUEC`);

        return interaction.reply({ content: `💸 Merci pour ton don de **${montant.toLocaleString()} aUEC** !`, ephemeral: true });
    }

    if (interaction.isButton()) {
        if (id.startsWith('join_event_')) {
            const idx = parseInt(id.split('_')[2], 10);
            const ev = events[idx];
            if (!ev) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });
            ev.participants = ev.participants || [];
            if (ev.participants.includes(interaction.user.id)) {
                return interaction.reply({ content: '✅ Tu participes déjà.', ephemeral: true });
            }
            ev.participants.push(interaction.user.id);
            fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
            logAction(`${interaction.user.tag} a rejoint l'événement "${ev.nom || 'Sans nom'}"`);
            return interaction.reply({ content: '🎉 Participation confirmée !', ephemeral: true });
        }

        if (id.startsWith('delete_event_')) {
            const adminRole = interaction.guild.roles.cache.find(r => r.name === 'E-5');
            if (!adminRole || !interaction.member.roles.cache.has(adminRole.id)) {
                return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
            }
            await interaction.message.delete().catch(console.error);
            logAction(`${interaction.user.tag} a supprimé un événement.`);
            return interaction.reply({ content: '🗑️ Événement supprimé.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

