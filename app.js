require('dotenv').config();
const Discord = require('discord.js');
const fetch = require('node-fetch');
const client = new Discord.Client({
    intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES],
});

const PREFIX = '!';

const DATE_MAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

client.on('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Don't process messages without prefix or not from author
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    // Split message into arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/g);

    // Don't process empty messages
    if (args.length === 0) return;

    // Call the roll function
    if (args[0] === 'rollmale' || args[0] === 'rm') {
        roll(message, 2);
    } else if (args[0] === 'rollfemale' || args[0] === 'rf') {
        roll(message, 1);
    } else if (args[0] === 'rollother' || args[0] === 'ro') {
        roll(message, 3);
    } else if (args[0] === 'roll' || args[0] === 'r') {
        roll(message, 0);
    }
});

/**
 * Picks a random character from the animecharactersdatabase list and sends it to the user.
 * This can pick any character, any male character, or any female character.
 *
 * @param {Discord.Message} message Discord message object
 * @param {string[]} args Array of arguments
 * @param {number} gender 0 for any, 1 for female, 2 for male, 3 for other
 */
async function roll(message, gender) {
    const month = randInt(1, 13);
    const day = randInt(1, DATE_MAP[month - 1] + 1);

    try {
        const data = await fetch(
            `https://www.animecharactersdatabase.com/api_series_characters.php?month=${month}&day=${day}`,
            {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0',
                },
            }
        ).then((res) => res.json());

        // Filter character data based on gender
        const characters = data.characters;
        let filteredCharacters = characters;
        if (gender === 1) {
            filteredCharacters = characters.filter((char) => char.gender === 'Female');
        } else if (gender === 2) {
            filteredCharacters = characters.filter((char) => char.gender === 'Male');
        } else if (gender === 3) {
            filteredCharacters = characters.filter(
                (char) => char.gender !== 'Male' && char.gender !== 'Female'
            );
        }

        // If filtered list is empty, refetch character
        if (filteredCharacters.length === 0) {
            roll(message, gender);
            return;
        }

        // Pick a random char from the filtered list
        const pick = filteredCharacters[randInt(0, filteredCharacters.length - 1)];

        // Create MessageEmbed with info on character
        const embed = new Discord.MessageEmbed()
            .setTitle(pick.name)
            .setURL(`https://www.animecharactersdatabase.com/characters.php?id=${pick.id}`)
            .setColor('#86f9f9')
            .setDescription(
                `**Gender**: ${pick.gender}\n**Anime**:  ${pick.origin}\n\n${pick.desc}`
            )
            .setImage(pick.character_image.replace(/\/.\//g, '/'));

        // Send to channel
        message.channel.send({ embeds: [embed] });
    } catch (err) {
        console.error(err);
        sendError(message);
    }
}

/**
 * Generate a random number in the range [min, max)
 *
 * @param {number} min Minimum value (inclusive)
 * @param {number} max Maximum value (exclusive)
 * @returns {number} The randomly generated value
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Sends an error to the user
 *
 * @param {Discord.Message} message Discord message object
 */
function sendError(message) {
    message.channel.send('Could not fetch anime character data. Please try again later.');
}

// Login using bot token
client.login(process.env.TOKEN);
