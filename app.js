require('dotenv').config();
const Discord = require('discord.js');
const fetch = require('node-fetch');
const User = require('./models/User');
const Character = require('./models/Character');
const mongoose = require('mongoose');
const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

// Define constants
const PREFIX = '!';
const REACT_EMOJIS = ['⬅️', '➡️'];
const HELP_MESSAGE = `**========================= Michae Bot Commands =========================**

**!help** - Shows this message

:game_die: **Rolling** :game_die:
**!roll (!r)** - Rolls a random character
**!rollhistory (!rh)** - Shows your roll history up to the past 100 rolls

:heart: **Dating** :heart:
**!datelist (!dl)** - List all characters you are dating (heart react to date characters)
**!breakup <name> [#] (!br <name> [#])** - Stop dating a character (IRREVERSIBLE!!!)

:mag: **Search** :mag:
**!search <name> (!s <name>)** - Search for a character by name
**!simp <name>** - Look through a characters' photos

**===================================================================**
`;
const PINTEREST_1 =
    'https://www.pinterest.com/resource/BaseSearchResource/get/?data=%7B%22options%22%3A%7B%22article%22%3Anull%2C%22appliedProductFilters%22%3A%22---%22%2C%22auto_correction_disabled%22%3Afalse%2C%22corpus%22%3Anull%2C%22customized_rerank_type%22%3Anull%2C%22filters%22%3Anull%2C%22query%22%3A%22';
const PINTEREST_2 =
    '%22%2C%22query_pin_sigs%22%3Anull%2C%22redux_normalize_feed%22%3Atrue%2C%22rs%22%3A%22typed%22%2C%22scope%22%3A%22pins%22%2C%22source_id%22%3Anull%2C%22no_fetch_context_on_resource%22%3Afalse%7D%2C%22context%22%3A%7B%7D%7D&_=1640629902230';
let DB_COUNT = 0;

// Character class
class AnimeCharacter {
    constructor(url, img, name, media, mediaName) {
        this.id = id;
        this.url = url;
        this.img = img;
        this.name = name;
        this.media = media;
        this.mediaName = mediaName;
    }
}

// Connect mongoose to server
const mongoURL = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_URL}/data?retryWrites=true&w=majority`;
mongoose.connect(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Callbacks for db connections
const db = mongoose.connection;
db.on('error', (error) => {
    console.error(error);
    process.exit(1);
});
db.once('open', async () => {
    console.log('Connected to mongodb database!');
    DB_COUNT = await Character.count({});
    console.log(`There are ${DB_COUNT} characters in the database.`);
});

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
        case 'rollhistory':
        case 'rh':
            history(message, 2);
            break;
        case 'breakup':
        case 'br':
            breakup(message, args);
            break;
        case 'datelist':
        case 'dl':
            history(message, 1);
            break;
        case 'search':
        case 's':
            searchCharacter(message, args);
            break;
        case 'simp':
            simp(message, args);
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
async function roll(message) {
    try {
        // Get a random character from the database
        const char = await Character.findOne().skip(randInt(0, DB_COUNT)).exec();

        // Save character in DB
        await User.updateOne(
            { id: message.author.id },
            { $push: { rolls: char.id }, $setOnInsert: { id: message.author.id } },
            { upsert: true }
        );

        const rollMessage = await sendCharacter(message, char, true);
        await rollMessage.react('💗');

        // Listen for reactions
        const filter = (reaction, user) => {
            return reaction.emoji.name === '💗' && user.id === message.author.id;
        };
        rollMessage
            .awaitReactions({ filter, max: 1, time: 600000, errors: ['time'] })
            .then(async () => {
                // Make sure user is not already dating character
                const dating = await User.findOne({ id: message.author.id, dating: char.id });
                if (dating) {
                    rollMessage.channel.send(
                        `${message.author.username} You are already dating ${char.name}!`
                    );
                    return;
                }

                // Save character in DB
                await User.updateOne(
                    { id: message.author.id },
                    { $push: { dating: char.id }, $setOnInsert: { id: message.author.id } },
                    { upsert: true }
                );
                rollMessage.channel.send(`${message.author} is now dating ${char.name}!`);
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
 * If only one is found, send that one character to the user.
 * Otherwise, if multiple are found, sends the list to the user and let them pick.
 * Otherwise, if no character is found, send an error message to the user.
 *
 * @param {Discord.Message} message Discord message object
 * @param {string} search Name of the character to search for
 * @returns {Promise<AnimeCharacter>} Character object
 */
async function internalSearch(message, search) {
    try {
        // Search for the character
        const reg =
            search
                .trim()
                .split(' ')
                .map((s) => `(?=.*${s})`)
                .join('') + '.*';
        const characterList = await Character.find({ name: { $regex: reg, $options: 'i' } }).exec();

        // If there is only one character, return that character
        if (characterList.length === 1) {
            return characterList[0];
        }

        // If no characters are found, return null
        if (characterList.length === 0) {
            return null;
        }

        // ELSE: Multiple characters found, send list to user
        // and let them pick from a list

        // Page counter
        let page = 0;

        // Show the list of characters
        const queryMessage = await showPickerEmbed(message, search, characterList);

        // React with emojis
        react(queryMessage, REACT_EMOJIS);

        // Listen for an emoji reaction
        const filter = (reaction, user) => {
            return user.id === message.author.id && REACT_EMOJIS.includes(reaction.emoji.name);
        };
        const collector = queryMessage.createReactionCollector({ filter, time: 60000 });
        collector.on('collect', async (collected) => {
            // Get first reaction
            const reaction = collected.emoji.name;

            // Remove user's reaction
            queryMessage.reactions.cache
                .filter((reaction) => reaction.users.cache.has(message.author.id))
                .first()
                .users.remove(message.author.id);

            // Arrow and cancel emoji actions
            if (reaction === REACT_EMOJIS[0]) {
                // Left arrow emoji
                page = page > 0 ? page - 1 : page;
                showPickerEmbed(message, search, characterList, page, queryMessage);
            } else if (reaction === REACT_EMOJIS[1]) {
                // Right arrow emoji
                page = characterList.length > 10 * (page + 1) ? page + 1 : page;
                showPickerEmbed(message, search, characterList, page, queryMessage);
            }
        });

        // Listen for replies
        return new Promise((resolve) => {
            const filter = (m) => m.author.id === message.author.id;
            queryMessage.channel
                .awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
                .then(async (message) => {
                    try {
                        // Get the character
                        const char = characterList[parseInt(message.first().content) - 1];

                        // If the character is not found, send error message
                        if (!char) {
                            return resolve(-1);
                        }

                        // Else, return the character
                        return resolve(char);
                    } catch (err) {
                        message.channel.send('Invalid number was entered!');
                        return resolve(-1);
                    }
                })
                .catch(() => {
                    resolve(-1);
                });
        });
    } catch (err) {
        console.error(err);
        return null;
    }
}

/**
 * Sends a list of characters to the user to pick from. This can be edited through
 * additional function calls
 *
 * @param {Discord.Message} message Discord message object
 * @param {string} search Original search query
 * @param {AnimeCharacter[]} characterList List of characters
 * @param {number} page Page number
 * @param {Discord.Message} [prevMessage] If the message should be edited instead of sent, include this param
 * @returns {Promise<Discord.Message>} The picker message sent or edited
 */
async function showPickerEmbed(message, search, characterList, page = 0, prevMessage = null) {
    // If the character list is greater than 10, split it into two lists, with the current list containing the 1st 10 entries
    const currList =
        characterList.length > 10 ? characterList.slice(page * 10, (page + 1) * 10) : characterList;

    // Create the Embed and display it
    const desc = currList
        .map(
            (char, index) =>
                `${page * 10 + index + 1}. **${char.name}** - ${char.media}: ${char.mediaName}\n`
        )
        .join('');
    const embed = new Discord.MessageEmbed()
        .setTitle(`Enter a number to pick a character (*search: ${search}*):\n`)
        .setDescription(desc)
        .setFooter(`Searched by ${message.author.username}`, message.author.avatarURL());

    // Edit or send message depending on if it is a recursive call
    const queryMessage = prevMessage
        ? await prevMessage.edit({ embeds: [embed] })
        : await message.channel.send({ embeds: [embed] });

    return queryMessage;
}

/**
 * React to given message with emojis in order
 *
 * @param {Discord.Message} message Discord message object
 * @param {string[]} emojiList List of emojis to react with
 */
async function react(message, emojiList) {
    for (let i = 0; i < emojiList.length; i++) {
        await message.react(emojiList[i]);
    }
}

/**
 * Show history for rolls/dating
 *
 * @param {Discord.Message} message Discord message object
 * @param {1 | 2} option Option number (1 is dating, 2 is rolls)
 */
async function history(message, option) {
    const currUser = await User.findOne({ id: message.author.id });
    let list = currUser ? (option === 1 ? currUser.dating : currUser.rolls) : [];

    // Send empty list if empty
    if (list.length === 0) {
        sendHistoryList(message, [], 1, option);
        return;
    }

    // Page number counter
    let page = 0;

    // Show the list of characters
    const histMessage = await sendHistoryList(message, list, page, option);

    // React with emojis
    react(histMessage, REACT_EMOJIS);

    // Listen for an emoji reaction
    const filter = (reaction, user) => {
        return user.id === message.author.id && REACT_EMOJIS.includes(reaction.emoji.name);
    };
    const collector = histMessage.createReactionCollector({ filter, time: 60000 });
    collector.on('collect', async (collected) => {
        // Get first reaction
        const reaction = collected.emoji.name;

        // Remove user's reaction
        histMessage.reactions.cache
            .filter((reaction) => reaction.users.cache.has(message.author.id))
            .first()
            .users.remove(message.author.id);

        // Arrow and cancel emoji actions
        if (reaction === REACT_EMOJIS[0]) {
            // Left arrow emoji
            if (page > 0) sendHistoryList(message, list, --page, option, histMessage);
        } else if (reaction === REACT_EMOJIS[1]) {
            // Right arrow emoji
            if (list.length > 10 * (page + 1))
                sendHistoryList(message, list, ++page, option, histMessage);
        }
    });
}

/**
 * Display a picture viewer of a certain character
 *
 * @param {Discord.Message} message Discord message object
 * @param {string[]} args List of arguments
 */
async function simp(message, args) {
    const name = args.slice(1).join(' ');
    const char = await internalSearch(message, name);

    if (char === -1) return;
    else if (char) {
        sendPictureGallery(message, char);
    } else {
        message.channel.send(`Couldn't find character **${name}**.`);
    }
}

/**
 * Breakup with a character, if they are in your dating list
 *
 * @param {Discord.Message} message Discord message object
 * @param {string[]} args List of arguments
 */
async function breakup(message, args) {
    try {
        // Get the character the user wants to break up with
        const name = args.slice(1).join(' ');
        const char = await internalSearch(message, name);

        // If the character is not found, send error message
        if (char === -1) return;
        else if (char === null) {
            message.channel.send(`Couldn't find character **${name}**.`);
            return;
        }

        // Get the list of characters the user is currently dating
        const userData = await User.findOne({ id: message.author.id });
        if (!userData) {
            message.channel.send('ERROR: Cannot get user data :(');
            return;
        }

        // See if the character is in the user's list
        const index = userData.dating.findIndex((id) => id === char.id);
        if (index === -1) {
            message.channel.send(`You are not currently dating **${char.name}**!`);
            return;
        }

        // Remove the character from the user's list and save
        userData.dating.splice(index, 1);
        await userData.save();

        // Send success message to user
        message.channel.send(`You are no longer dating **${char.name}** :broken_heart:`);
    } catch (err) {
        console.error(err);
        message.channel.send('ERROR: Could not break up due to internal server error :(');
    }
}

// =============== UTILITY FUNCTIONS ===============

/**
 * Send a specific character to the user
 *
 * @param {Discord.Message} message Discord message object
 * @param {AnimeCharacter} character Character object
 * @param {boolean} [isRoll] True if the character is a roll
 */
async function sendCharacter(message, character, isRoll) {
    // Get favorite count for user
    const favoriteCount = character.favorites
        ? character.favorites
        : await getAndUpdateFavoriteCount(character.id);

    // Create MessageEmbed with info on character
    const embed = new Discord.MessageEmbed()
        .setTitle(character.name)
        .setURL(character.url)
        .setColor('#86f9f9')
        .setDescription(
            `**${character.media}**: ${character.mediaName}\n**Likes**: ${favoriteCount}`
        )
        .setImage(character.img);

    // Add rolled by footer
    if (isRoll) embed.setFooter(`Rolled by ${message.author.username}`, message.author.avatarURL());

    // Send to channel
    return await message.channel.send({ embeds: [embed] });
}

/**
 * Send list of characters from rolls/dating to user
 *
 * @param {Discord.Message} message Discord message object
 * @param {AnimeCharacter[]} characterList List of characters to send
 * @param {number} [page] Page number
 * @param {number} option Dating list (1) or roll history (2)
 * @param {Discord.Message} [prevMessage] If the message should be edited instead of sent, include this param
 * @returns {Promise<Discord.Message>} The picker message sent
 */
async function sendHistoryList(message, characterList, page = 0, option, prevMessage) {
    const currList = characterList.slice(page * 10, (page + 1) * 10);
    const desc = (
        await Promise.all(
            currList.map(async (id) => {
                const char = await Character.findOne({ id });
                return `**${char.name}** - ${char.media}: ${char.mediaName}\n`;
            })
        )
    ).join('');
    const embed = new Discord.MessageEmbed()
        .setTitle(
            `Characters ${message.author.username} ${
                option === 1 ? 'are Dating' : 'have Rolled'
            }! ${
                characterList.length > 10
                    ? `(Page ${page + 1} / ${Math.ceil(characterList.length / 10)})`
                    : ''
            }`
        )
        .setDescription(desc);
    return prevMessage
        ? await prevMessage.edit({ embeds: [embed] })
        : await message.channel.send({ embeds: [embed] });
}

/**
 * Updates the favorite count for a character and returns it.
 * Will return null if the favorite count for a character cannot be loaded.
 *
 * @param {number} id Character ID
 * @returns {Promise<number>} Favorite count for the given character
 */
async function getAndUpdateFavoriteCount(id) {
    // Get character from DB and data from API
    const char = await Character.findOne({ id });
    const html = await fetch(char.url).then((res) => res.text());

    // Check if the page is throttled
    while (isThrottled(html)) {
        console.log(`ERROR: Connection throttled on ${new Date().toTimeString()}!`);
        return null;
    }

    // Parse favorites and save
    const favorites = getFavorites(html);
    if (favorites === null) {
        console.log(`${char.name} - ERROR: Could not find favorites`);
    } else {
        await char.updateOne({ favorites });
        return favorites;
    }
}

/**
 * Finds the number of favorites for each character in the list
 *
 * @param {string} html HTML to parse
 * @returns {number} Number of favorites
 */
function getFavorites(html) {
    try {
        const num = Number.parseInt(
            html
                .replace(/.*Member Favorites: (.*?)<\/td>.*/gs, '$1')
                .replace(',', '')
                .trim()
        );
        if (isNaN(num)) return null;
        return num;
    } catch (err) {
        return null;
    }
}

/**
 * Shows a picture gallery of a character
 *
 * @param {Discord.Message} message Discord message object
 * @param {AnimeCharacter} character Character object
 */
async function sendPictureGallery(message, character) {
    const query = (character.name + ' ' + character.mediaName).replace(/ /g, '%20');
    const data = await fetch(`${PINTEREST_1}${query}${PINTEREST_2}`, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0',
        },
    }).then((res) => res.json());

    // Process data
    const rawList = data.resource_response.data.results;
    const imgList = rawList.map((item) => ({
        url: item.images.orig.url,
        id: item.id,
        dominant_color: item.dominant_color,
    }));
    const name = character.name;

    // Page counter
    let page = 0;

    // Create initial message
    const pictureMessage = await displayPicture(message, name, character, imgList, page);

    // React with emojis
    react(pictureMessage, REACT_EMOJIS);

    // Listen for an emoji reaction
    const filter = (reaction, user) => {
        return user.id === message.author.id && REACT_EMOJIS.includes(reaction.emoji.name);
    };
    const collector = pictureMessage.createReactionCollector({ filter, time: 60000 });
    collector.on('collect', async (collected) => {
        // Get first reaction
        const reaction = collected.emoji.name;

        // Remove user's reaction
        pictureMessage.reactions.cache
            .filter((reaction) => reaction.users.cache.has(message.author.id))
            .first()
            .users.remove(message.author.id);

        // Arrow and cancel emoji actions
        if (reaction === REACT_EMOJIS[0]) {
            // Left arrow emoji
            page = page > 0 ? page - 1 : page;
            displayPicture(message, name, character, imgList, page, pictureMessage);
        } else if (reaction === REACT_EMOJIS[1]) {
            // Right arrow emoji
            page = imgList.length > page ? page + 1 : page;
            displayPicture(message, name, character, imgList, page, pictureMessage);
        }
    });
}

/**
 * Displays a character's picture with a pageable display
 *
 * @param {Discord.Message} message Discord message object
 * @param {string} name Name of the character
 * @param {AnimeCharacter} character Character object
 * @param {Object[]} imgList List of images to display
 * @param {number} page Page number
 * @param {Discord.Message} [prevMessage] If the message should be edited instead of sent, include this param
 */
async function displayPicture(message, name, character, imgList, page = 0, prevMessage) {
    const embed = new Discord.MessageEmbed()
        .setTitle(`${name} (${page + 1}/${imgList.length})`)
        .setImage(imgList[page].url)
        .setURL(`https://www.pinterest.com/pin/${imgList[page].id}/`)
        .setColor(imgList[page].dominant_color)
        .setDescription(`**${character.media}**:  ${character.mediaName}`)
        .setFooter(`Pictures requested by ${message.author.username}`, message.author.avatarURL());

    return prevMessage
        ? prevMessage.edit({ embeds: [embed] })
        : message.channel.send({ embeds: [embed] });
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
 * Checks to see if the current page is throttled bc too many bot requests.
 * This can be easily bypassed by manually telling the site that it is a human!
 *
 * @param {string} html HTML string
 * @returns {boolean} True if the current page is throttled
 */
function isThrottled(html) {
    return html.includes('We are temporarily restricting site connections due to heavy access.');
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
