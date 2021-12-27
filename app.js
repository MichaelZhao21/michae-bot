require('dotenv').config();
const Discord = require('discord.js');
const fetch = require('node-fetch');
const User = require('./User');
const mongoose = require('mongoose');
const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
});

// Define constants
const PREFIX = '!';
const DATE_MAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const EMOJI_NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const HELP_MESSAGE = `**========================= Michae Bot Commands =========================**

**!help** - Shows this message

:game_die: **Rolling** :game_die:
**!roll (!r)** - Rolls a random character
**!rollmale (!rm)** - Rolls a male character
**!rollfemale (!rf)** - Rolls a female character
**!rollother (!ro)** - Rolls a non male/female character
**!rollhistory (!rh)** - Shows your roll history up to the past 100 rolls

:heart: **Dating** :heart:
**!datelist (!dl)** - List all characters you are dating (heart react to date characters)

:mag: **Search** :mag:
**!search <name> [#] (!s <name> [#])** - Search for a character by name (and position on list if multiple)

**===================================================================**
`;

// TODO: ADD THIS
// **!date <name> [#] (!d <name> [#])** - Date a rolled character (up to the last 100 rolled)
// **!breakup <name> [#] (!br <name> [#])** - Stop dating a character (IRREVERSIBLE!!!)

// Character class
class Character {
    constructor(char) {
        this.id = char.id;
        this.origin = char.origin;
        this.anime_name = char.anime_name;
        this.gender = char.gender;
        this.name = char.name;
    }
}

// Connect mongoose to server
const mongoURL = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_URL}/data?retryWrites=true&w=majority`;
mongoose.connect(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });

// Callbacks for db connections
const db = mongoose.connection;
db.on('error', (error) => {
    console.error(error);
    process.exit(1);
});
db.once('open', () => console.log('Connected to mongodb database!'));

// When the bot is ready
client.on('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
});

// Run when user sends a message (main runner for bot)
client.on('messageCreate', async (message) => {
    // Don't process messages without prefix or not from author
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    // Split message into arguments
    const args = message.content.toLowerCase().slice(PREFIX.length).trim().split(/ +/g);

    // Don't process empty messages
    if (args.length === 0) return;

    // Run command
    switch (args[0]) {
        case 'help':
            sendHelpMessage(message, false);
            break;
        case 'roll':
        case 'r':
            roll(message, 0);
            break;
        case 'rollfemale':
        case 'rf':
            roll(message, 1);
            break;
        case 'rollmale':
        case 'rm':
            roll(message, 2);
            break;
        case 'rollother':
        case 'ro':
            roll(message, 3);
            break;
        case 'rollhistory':
        case 'rh':
            history(message, 2);
            break;
        // case 'breakup':
        // case 'br':
        //     dateCharacter(message, args, 0);
        //     break;
        case 'datelist':
        case 'dl':
            history(message, 1);
            break;
        case 'search':
        case 's':
            searchCharacter(message, args);
            break;
        default:
            sendHelpMessage(message, true);
            break;
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

        // Save character in DB
        await User.updateOne(
            { id: message.author.id },
            { $push: { rolls: pick }, $setOnInsert: { id: message.author.id } },
            { upsert: true }
        );

        const rollMessage = await sendCharacter(message, pick);
        await rollMessage.react('💗');

        // Listen for reactions
        const filter = (reaction, user) => {
            return reaction.emoji.name === '💗' && user.id === message.author.id;
        };
        rollMessage
            .awaitReactions({ filter, max: 1, time: 600000, errors: ['time'] })
            .then(async (collected) => {
                // Save character in DB
                await User.updateOne(
                    { id: message.author.id },
                    { $push: { dating: pick }, $setOnInsert: { id: message.author.id } },
                    { upsert: true }
                );
                rollMessage.channel.send(`${message.author} is now dating ${pick.name}!`);
            })
            .catch(() => {
                rollMessage.reactions.removeAll();
                return null;
            });
    } catch (err) {
        console.error(err);
        sendError(message);
    }
}

/**
 * Searches for a character within the AnimeCharactersDatabase list.
 *
 * @param {Discord.Message} message Discord message object
 * @param {string[]} args Array of arguments
 */
async function searchCharacter(message, args) {
    // Don't search if no name provided
    if (args.length < 2) {
        message.channel.send(
            'Invalid use of command. Use `!search <character name> [optional list position]`'
        );
        return;
    }

    // Search for the character
    const name = args.slice(1).join(' ');
    const char = await internalSearch(message, name);
    if (char === -1) return;
    else if (char) {
        sendCharacter(message, char);
    } else {
        message.channel.send(`Couldn't find character **${name}**.`);
    }
}

/**
 * Internal method that searches for a character based on the following method:
 *
 * If an exact match is found, send that one character to the user.
 * If multiple exact matches are found, send the list to the user to pick from using reaction listeners.
 *
 * Otherwise, if multiple are found, sends the list to the user.
 * If only one is found, send that one character to the user.
 *
 * Otherwise, if no character is found, send an error message to the user.
 *
 * @param {Discord.Message} message Discord message object
 * @param {String[]} name Name of the character to search for
 * @returns {Promise<Character>} Character object
 */
async function internalSearch(message, name) {
    try {
        // Get character query list
        const data = await fetch(
            `https://www.animecharactersdatabase.com/api_series_characters.php?character_q=${name}`,
            {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0',
                },
            }
        ).then((res) => res.json());

        // If no characters are found, send error message
        if (data === -1) return null;

        // Create character list
        let characters = data.search_results;
        let exact = false;

        // Check to see if there is an exact match
        // If so, filter the list and use it as the search result list
        const exactMatches = data.search_results.filter(
            (char) => char.name.toLowerCase() === name.toLowerCase()
        );
        if (exactMatches.length !== 0) {
            characters = exactMatches;
            exact = true;
        }

        // If there is only one character, return that character
        if (characters.length === 1) {
            return characters[0];
        }

        // If no characters are found, return null
        if (characters.length === 0) {
            return null;
        }

        // If there are not exact matches, send list to user and return null
        if (!exact) {
            // Split the char list if > 50
            let characters2 = [];
            if (characters.length > 50) {
                characters2 = characters.slice(50);
                characters = characters.slice(0, 50);
            }
            sendCharacterList(name, message, characters);
            if (characters2.length > 0) sendCharacterList(name, message, characters2, true);

            return -1;
        }

        // Else if there ARE exact matches, allow for user to pick
        // Map the characters to a list of strings
        const desc = characters
            .map((char) => `**${char.name}** *(${char.gender})* - ${char.anime_name}\n`)
            .join('');
        const embed = new Discord.MessageEmbed()
            .setTitle(`Pick the Character (name: *${name}*)`)
            .setDescription(desc);
        const queryMessage = await message.channel.send({ embeds: [embed] });
        const emojis = EMOJI_NUMS.slice(0, characters.length);
        for (let i = 0; i < emojis.length; i++) {
            const emoji = emojis[i];
            await queryMessage.react(emoji);
        }

        // Listen for reactions
        return new Promise((resolve) => {
            const filter = (reaction, user) => {
                return emojis.includes(reaction.emoji.name) && user.id === message.author.id;
            };
            queryMessage
                .awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] })
                .then((collected) => {
                    const reaction = collected.first();
                    const index = emojis.indexOf(reaction.emoji.name);
                    queryMessage.reactions.removeAll();
                    resolve(characters[index]);
                })
                .catch(() => {
                    queryMessage.reactions.removeAll();
                    queryMessage.reply(
                        `${message.author} You were too slow! No character selected.`
                    );
                    resolve(-1);
                });
        });
    } catch (err) {
        console.error(err);
        return null;
    }
}

/**
 * Show history for rolls/dating
 *
 * @param {Discord.Message} message Discord message object
 * @param {1 | 2} option Option number (1 is dating, 2 is rolls)
 * @returns
 */
async function history(message, option) {
    const currUser = await User.findOne({ id: message.author.id });
    let list = currUser ? (option === 1 ? currUser.dating : currUser.rolls) : [];

    if (list.length === 0) {
        sendCharacterList(null, message, [], 1, option);
        return;
    }

    let pageCount = 1;
    while (list.length > 0) {
        const currPage = list.slice(0, 50);
        list = list.slice(50);
        sendCharacterList(null, message, currPage, pageCount++, option);
    }
    return;
}

// =============== UTILITY FUNCTIONS ===============

/**
 * Send a specific character to the user
 *
 * @param {Discord.Message} message Discord message object
 * @param {Character} character Character object
 */
async function sendCharacter(message, character) {
    // Create MessageEmbed with info on character
    const embed = new Discord.MessageEmbed()
        .setTitle(character.name)
        .setURL(`https://www.animecharactersdatabase.com/characters.php?id=${character.id}`)
        .setColor('#86f9f9')
        .setDescription(
            `**Gender**: ${character.gender}\n**Anime/Game**:  ${
                character.origin || character.anime_name
            }\n\n${character.desc}`
        )
        .setImage(character.character_image.replace(/\/.\//g, '/'));

    // Send to channel
    return await message.channel.send({ embeds: [embed] });
}

/**
 * Send list of characters to user
 *
 * @param {string} name Name of the search
 * @param {Discord.Message} message Discord message object
 * @param {Character[]} characterList List of characters to send
 * @param {number} [page] Page number
 * @param {number} [dating] Is this the dating/rolls history (1/2)
 */
async function sendCharacterList(name, message, characterList, page = 1, dating) {
    const desc = characterList
        .map((char) => `**${char.name}** *(${char.gender})* - ${char.anime_name || char.origin}\n`)
        .join('');
    const embed = new Discord.MessageEmbed()
        .setTitle(
            `${
                dating
                    ? `Characters ${message.author.username} ${
                          dating === 1 ? 'are Dating' : 'have Rolled'
                      }!`
                    : `Search Results for **${name}**`
            } ${page !== 1 ? `(Page ${page})` : ''}`
        )
        .setDescription(desc);
    await message.channel.send({ embeds: [embed] });
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
    message.channel.send(
        'Could not process your request :( Please try again later or contact the developer.'
    );
}

/**
 * Sends help/error messsage
 *
 * @param {Discord.Message} message Discord message object
 * @param {boolean} error Whether or not to send an error message
 */
function sendHelpMessage(message, error) {
    if (error) message.channel.send('Invalid command. Type `!help` for a list of commands.');
    else message.channel.send(HELP_MESSAGE);
}

// Login using bot token
client.login(process.env.TOKEN);
