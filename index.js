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

    // Lecture de lastversion.txt
    if (fs.existsSync(versionFile)) {
        lastVersion = fs.readFileSync(versionFile, 'utf8').trim();
        console.log(`📄 Version précédente détectée : ${lastVersion}`);
    } else {
        console.log('📄 Aucune version précédente détectée.');
    }

    // Comparaison
    if (currentVersion !== lastVersion) {
        console.log('🔁 Nouvelle version détectée, préparation du message...');

        const channel = await client.channels.fetch(updateChannelId).catch(err => {
            console.error('❌ Erreur récupération du salon :', err);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            return console.error('❌ Salon invalide ou inaccessible.');
        }

        let changelogText = '- Aucun changelog disponible.';
        const changelogFile = path.join(__dirname, 'changelog.json');

        if (fs.existsSync(changelogFile)) {
            console.log('📘 Lecture du changelog.json...');
            const changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8'));
            changelogText = changelog[currentVersion] || changelogText;
            console.log('📘 Contenu du changelog pour cette version :', changelogText);
        } else {
            console.log('⚠️ Aucun fichier changelog.json trouvé.');
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔄 Mise à jour du bot : v${currentVersion}`)
            .setDescription(changelogText)
            .setColor(0xFFA500)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log('✅ Message de mise à jour envoyé dans Discord.');

        fs.writeFileSync(versionFile, currentVersion);
        console.log('📁 lastversion.txt mis à jour.');
    } else {
        console.log('✅ Aucune nouvelle version détectée, pas de message envoyé.');
    }
});

// Message de bienvenue
client.on(Events.GuildMemberAdd, async member => {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle(`👋 Bienvenue, ${member.user.username} !`)
        .setDescription(`Bienvenue sur **${member.guild.name}**.\n\n💬 Pense à lire les règles.\n🎭 Choisis ton rôle pour commencer.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor(0x00AE86)
        .setTimestamp();

    channel.send({ embeds: [embed] });
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

// Gestion des interactions : bouton + modal + event
client.on(Events.InteractionCreate, async interaction => {
    // Ouverture du modal de don
    if (interaction.isButton() && interaction.customId === 'open_donation_modal') {
        const modal = new ModalBuilder()
            .setCustomId('custom_donation_modal')
            .setTitle('Faire un don à Stormbreaker');
        const input = new TextInputBuilder()
            .setCustomId('donation_amount')
            .setLabel('Montant à donner (en AUEC)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex : 5000')
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // Traitement du modal de don
    if (interaction.isModalSubmit() && interaction.customId === 'custom_donation_modal') {
        const montant = parseInt(interaction.fields.getTextInputValue('donation_amount'), 10);
        if (isNaN(montant) || montant <= 0) {
            return interaction.reply({ content: '❌ Montant invalide.', ephemeral: true });
        }
        const bp = path.join(__dirname, 'banque.json');
        const banque = JSON.parse(fs.readFileSync(bp));
        banque.total = banque.total || 0;
        banque.donateurs = banque.donateurs || {};
        banque.transactions = banque.transactions || [];
        const uid = interaction.user.id;
        banque.total += montant;
        banque.donateurs[uid] = (banque.donateurs[uid] || 0) + montant;
        banque.transactions.push({ userId: uid, username: interaction.user.username, amount: montant, timestamp: new Date().toISOString() });
        fs.writeFileSync(bp, JSON.stringify(banque, null, 2));
        return interaction.reply({ content: `💸 Merci pour ton don de **${montant.toLocaleString()} aUEC** !`, ephemeral: true });
    }

    // Gestion des boutons d'événement
    if (interaction.isButton()) {
        const id = interaction.customId;
        const eventsPath = path.join(__dirname, 'events.json');
        const events = JSON.parse(fs.readFileSync(eventsPath));

        // Participation
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
            return interaction.reply({ content: '🎉 Participation confirmée !', ephemeral: true });
        }

        // Désistement
        if (id.startsWith('decline_event_')) {
            const idx = parseInt(id.split('_')[2], 10);
            const ev = events[idx];
            if (!ev) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });
            ev.participants = (ev.participants || []).filter(u => u !== interaction.user.id);
            fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
            return interaction.reply({ content: '❌ Tu ne participes plus.', ephemeral: true });
        }

        // Suppression (Admin E-5)
        if (id.startsWith('delete_event_')) {
            const idx = parseInt(id.split('_')[2], 10);
            const adminRole = interaction.guild.roles.cache.find(r => r.name === 'E-5');
            if (!adminRole || !interaction.member.roles.cache.has(adminRole.id)) {
                return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
            }
            if (!events[idx]) {
                return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });
            }
            events.splice(idx, 1);
            fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));
            await interaction.message.delete().catch(console.error);
            return interaction.reply({ content: '🗑️ Événement supprimé.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
