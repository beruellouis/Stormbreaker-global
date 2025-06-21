const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'sendroles',
    description: 'Envoie les boutons de rôles dans le salon dédié.',
    async execute(message) {
        const roleChannelId = process.env.ROLE_CHANNEL_ID;
        const roleButtonFile = 'role_button_id.txt';
        const channel = await message.guild.channels.fetch(roleChannelId).catch(() => null);

        if (!channel || !channel.isTextBased()) {
            return message.reply('❌ Le salon des rôles est introuvable ou inaccessible.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🎭 Choisis ton orientation')
            .setDescription('Appuie sur un bouton ci-dessous pour accéder à un salon privé')
            .setColor(0x3498DB);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket').setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('open_candidature').setLabel('📄 Candidature').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('open_ambassade').setLabel('🤝 Ambassade').setStyle(ButtonStyle.Secondary)
        );

        const sentMessage = await channel.send({ embeds: [embed], components: [row] });

        fs.writeFileSync(path.join(__dirname, '..', roleButtonFile), sentMessage.id);
        message.reply('✅ Boutons envoyés dans le salon des rôles.');
    }
};
