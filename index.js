require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ActionRowBuilder: ModalRow
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Chargement des commandes
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        client.commands.set(command.name, command);
    }
}

client.once('ready', () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

// Message de bienvenue
client.on('guildMemberAdd', member => {
    const channel = member.guild.systemChannel;
    if (!channel) return;
    channel.send({
        embeds: [{
            title: `👋 Bienvenue, ${member.user.username} !`,
            description: `Bienvenue sur **${member.guild.name}**. Pense à lire les règles et choisir ton rôle !`,
            thumbnail: { url: member.user.displayAvatarURL({ dynamic: true }) },
            color: 0x00AE86
        }]
    });
});

// Commandes texte (!banque, etc.)
client.on('messageCreate', async message => {
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

// Gestion des interactions : bouton + modal
client.on('interactionCreate', async interaction => {
    // Bouton : ouvrir le formulaire de don
    if (interaction.isButton() && interaction.customId === 'open_donation_modal') {
        const modal = new ModalBuilder()
            .setCustomId('custom_donation_modal')
            .setTitle('Faire un don à Stormbreaker');

        const amountInput = new TextInputBuilder()
            .setCustomId('donation_amount')
            .setLabel("Montant à donner (en AUEC)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex : 5000')
            .setRequired(true);

        const row = new ModalRow().addComponents(amountInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    }

    // Modal : traitement du don
    if (interaction.isModalSubmit() && interaction.customId === 'custom_donation_modal') {
        const montantStr = interaction.fields.getTextInputValue('donation_amount');
        const montant = parseInt(montantStr);

        if (isNaN(montant) || montant <= 0) {
            return interaction.reply({ content: '❌ Montant invalide.', flags: 64 });
        }

        const banquePath = path.join(__dirname, 'banque.json');
        const banque = JSON.parse(fs.readFileSync(banquePath));
        const userId = interaction.user.id;

        banque.total += montant;
        banque.donateurs[userId] = (banque.donateurs[userId] || 0) + montant;
        banque.transactions.push({
            userId,
            username: interaction.user.username,
            type: 'add',
            amount: montant,
            timestamp: new Date().toISOString()
        });

        fs.writeFileSync(banquePath, JSON.stringify(banque, null, 2));

        return interaction.reply({
            content: `💸 Merci pour ton don de **${montant.toLocaleString()} aUEC** !`,
            flags: 64
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
