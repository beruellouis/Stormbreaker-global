const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const eventsFile = path.join(__dirname, '..', 'events.json');

function saveEvents(events) {
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
}

function loadEvents() {
    if (!fs.existsSync(eventsFile)) return [];
    return JSON.parse(fs.readFileSync(eventsFile));
}

module.exports = {
    name: 'event',
    description: 'Gère les événements de l’organisation',
    async execute(message, args) {
        const [sub, ...rest] = args;
        let events = loadEvents();

        // 📋 Afficher les événements
        if (!sub || sub === 'list') {
            if (events.length === 0) {
                return message.channel.send('📭 Aucun événement programmé.');
            }

            for (let i = 0; i < events.length; i++) {
                const e = events[i];

                const participants = (e.participants || []).map(id => `<@${id}>`).join(', ') || 'Personne encore';
                const nonParticipants = (e.nonParticipants || []).map(id => `<@${id}>`).join(', ') || 'Aucun refus';

                const buttons = [
                    new ButtonBuilder()
                        .setCustomId(`join_event_${i}`)
                        .setLabel('✅ Je participe')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`decline_event_${i}`)
                        .setLabel('❌ Je ne participe pas')
                        .setStyle(ButtonStyle.Secondary)
                ];

                // 🛡️ Ajouter le bouton supprimer si membre a le rôle "E-5"
                if (message.member.roles.cache.some(role => role.name === 'E-5')) {
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(`delete_event_${i}`)
                            .setLabel('🗑️ Supprimer')
                            .setStyle(ButtonStyle.Danger)
                    );
                }

                const row = new ActionRowBuilder().addComponents(buttons);

                await message.channel.send({
                    embeds: [{
                        title: `📌 ${e.title}`,
                        description: `🗓️ ${e.date}\n${e.description}`,
                        fields: [
                            { name: '👥 Participants', value: participants },
                            { name: '🙅 Non-participants', value: nonParticipants }
                        ],
                        color: 0x3498DB
                    }],
                    components: [row]
                });
            }
            return;
        }

        // ➕ Ajouter un événement
        if (sub === 'add') {
            if (!message.member.roles.cache.some(role => role.name === 'E-5')) {
                return message.reply('🚫 Tu dois avoir le rôle `E-5` pour créer un événement.');
            }

            const input = rest.join(' ').split('|');
            if (input.length < 3) {
                return message.reply('❌ Format : `!event add Titre | Date | Description`');
            }

            const [title, date, description] = input.map(x => x.trim());
            events.push({ title, date, description, participants: [], nonParticipants: [] });
            saveEvents(events);

            await message.channel.send({
                content: '@everyone\n📢 **NOUVEL ÉVÉNEMENT**\n📌 ' + title + '\n🗓️ ' + date + '\n' + description,
                allowedMentions: { parse: ['everyone'] }
            });

            return message.channel.send(`✅ Événement **${title}** ajouté.`);
        }

        // 🗑️ Supprimer un événement
        if (sub === 'remove') {
            if (!message.member.roles.cache.some(role => role.name === 'E-5')) {
                return message.reply('🚫 Tu dois avoir le rôle `E-5` pour supprimer un événement.');
            }

            const id = parseInt(rest[0]);
            if (isNaN(id) || id < 0 || id >= events.length) {
                return message.reply('❌ ID invalide.');
            }

            const removed = events.splice(id, 1)[0];
            saveEvents(events);
            return message.channel.send(`🗑️ Événement **${removed.title}** supprimé.`);
        }

        message.reply('❌ Sous-commande inconnue.');
    }
};