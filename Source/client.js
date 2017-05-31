const Discord = require("discord.js");
const fs = require("fs-extra-promise");
const path = require("path");
const mongoose = require('mongoose');
const autoIncrement = require("mongoose-auto-increment");

const ModuleManager = require("./Managers/Modules");
const CommandsManager = require("./Managers/Commands");
const InputUtilities = require("./Util/Input");

const DirectMessagesManager = require("./Managers/DirectMessages");

const Command = require("./Util/Command");

const GuildConfig = require("./Model/guild");

const EmbedFactory = require("./Util/EmbedFactory");

const Logger = require("./Util/Logger");

const defaultGuildConfig = {
    snowflake: "251208047706374154",
    autoRemoveBotMessges: 5,
    autoRemoveUserCommands: 5,
    autoRemoveUserWarningPoints: 1000,
    autoKickUserWarningPoints: 300,
    name: "This Guild",
    disabledCommands: [],
    disabledModules: []
}

const client = new class extends Discord.Client {
    constructor() {
        super();
        process.on('unhandledRejection', rejection => {
            this.log(rejection, true);
        })
        this.fullPermissions = {
            CREATE_INSTANT_INVITE: "Create Instant Invite",
            KICK_MEMBERS: "Kick Members",
            BAN_MEMBERS: "Ban Members",
            ADMINISTRATOR: "Administrator",
            MANAGE_CHANNELS: "Manage Channels",
            MANAGE_GUILD: "Manage Server",
            ADD_REACTIONS: "Add Reactions",
            READ_MESSAGES: "Read Messages",
            SEND_MESSAGES: "Send Messages",
            SEND_TTS_MESSAGES: "Send TTS Messages",
            MANAGE_MESSAGES: "Manage Messages",
            EMBED_LINKS: "Embed Links",
            ATTACH_FILES: "Attach Files",
            READ_MESSAGE_HISTORY: "Read Message History",
            MENTION_EVERYONE: "Mention Everyone",
            EXTERNAL_EMOJIS: "Use External Emojis",
            CONNECT: "Connect (Voice)",
            SPEAK: "Speak (Voice)",
            MUTE_MEMBERS: "Mute Members (Voice)",
            DEAFEN_MEMBERS: "Deafen Members (Voice)",
            MOVE_MEMBERS: "Move Members (Voice)",
            USE_VAD: "Use Voice Activity",
            CHANGE_NICKNAME: "Change Nickname",
            MANAGE_NICKNAMES: "Manage Nicknames",
            MANAGE_ROLES_OR_PERMISSIONS: "Manage Roles",
            MANAGE_WEBHOOKS: "Manage Webhooks",
            MANAGE_EMOJIS: "Manage Emojis"
        };
        
        this.modulesManager = new ModuleManager(this, this.commandsManager);
        this.cwd = __dirname;
        this.embedFactory = new EmbedFactory(this);
        this.input = new InputUtilities(this);
        this.commandsManager = new CommandsManager(this);
        this.directMessagesManager = new DirectMessagesManager(this);
        
        this.config = require("./config");
        this.meta = require("../package");

        mongoose.connect(this.config.database);
        autoIncrement.initialize(mongoose.connection);

        this.on("ready", () => {
            this.log(`Client ready to take commands`);
            this.user.setAvatar(__dirname + "/resources/icon.png").catch(e => e.code !== undefined ? this.log(e, true) : null);
            this.setStatusFromConfig();
        })
            .on("message", message => message.guild ? message.guild.manager.messagesManager.handle(message) : this.directMessagesManager.handle(message))
            .on("guildCreate", guild => {
                this.configureForGuild(guild).then(() => this.saveConfig());
            })
            .on("channelCreate", channel => {
                if (!channel.guild) return;
                var mutedRole = this.getMuteRoleForGuild(channel.guild);
                this.setMutedPermsOnChannel(channel, mutedRole);
            })
            .once("ready", () => {
                client.guilds.forEach(guild => {
                    this.configureForGuild(guild);
                })
                this.saveConfig();
            });
        this.on("channelCreate", channel => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(channel.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.channelCreate) moduleEvent.events.channelCreate(channel);
                });
            })
        }).on("channelDelete", channel => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(channel.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.channelDelete) moduleEvent.events.channelDelete(channel);
                });
            })
        }).on("channelPinsUpdate", (channel, time) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(channel.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.channelPinsUpdate) moduleEvent.events.channelPinsUpdate(channel);
                });
            })
        }).on("channelUpdate", (oldChannel, newChannel) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newChannel.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.channelUpdate) moduleEvent.events.channelUpdate(oldChannel, newChannel);
                });
            })
        }).on("clientUserSettingsUpdate", (clientUserSettings) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.clientUserSettingsUpdate) moduleEvent.events.clientUserSettingsUpdate(clientUserSettings);
            })
        }).on("debug", (info) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.debug) moduleEvent.events.debug(info);
            })
        }).on("disconnect", (event) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.disconnect) moduleEvent.events.disconnect(event);
            })
        }).on("emojiCreate", (emoji) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(emoji.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.emojiCreate) moduleEvent.events.emojiCreate(emoji);
                });
            })
        }).on("emojiDelete", (emoji) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(emoji.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.emoji) moduleEvent.events.emoji(emoji);
                });
            })
        }).on("emojiUpdate", (oldEmoji, newEmoji) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newEmoji.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.emojiUpdate) moduleEvent.events.emojiUpdate(oldEmoji, newEmoji);
                });
            })
        }).on("guildBanAdd", (guild, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildBanAdd) moduleEvent.events.guildBanAdd(guild, user);
                });
            })
        }).on("guildBanRemove", (guild, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildBanRemove) moduleEvent.events.guildBanRemove(guild, user);
                });
            })
        }).on("guildCreate", (guild) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildCreate) moduleEvent.events.guildCreate(guild);
                });
            })
        }).on("guildDelete", (guild) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildDelete) moduleEvent.events.guildDelete(guild);
                });
            })
        }).on("guildMemberAdd", (member) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(member.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMemberAdd) moduleEvent.events.guildMemberAdd(member);
                });
            })
        }).on("guildMemberAvailable", (member) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(member.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMemberAvailable) moduleEvent.events.guildMemberAvailable(member);
                });
            })
        }).on("guildMemberRemove", (member) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(member.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMemberRemove) moduleEvent.events.guildMemberRemove(member);
                });
            })
        }).on("guildMembersChunk", (collection, guild) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMembersChunk) moduleEvent.events.guildMembersChunk(collection, guild);
                });
            })
        }).on("guildMemberSpeaking", (member, speaking) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(member.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMemberSpeaking) moduleEvent.events.guildMemberSpeaking(member, speaking);
                });
            })
        }).on("guildMemberUpdate", (oldMember, newMember) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newMember.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildMemberUpdate) moduleEvent.events.guildMemberUpdate(oldMember, newMember);
                });
            })
        }).on("guildUnavailable", (guild) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildUnavailable) moduleEvent.events.guildUnavailable(guild);
                });
            })
        }).on("guildUpdate", (oldGuild, newGuild) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newGuild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.guildUpdate) moduleEvent.events.guildUpdate(oldGuild, newGuild);
                });
            })
        }).on("message", (message) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(message.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (message.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.message) moduleEvent.events.message(message);
                });
            })
        }).on("messageDelete", (message) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(message.guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (message.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageDelete) moduleEvent.events.messageDelete(message);
                });
            })
        }).on("messageDeleteBulk", (collection) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(collection.first().guild).then(config => {
                    if (!meta || !meta.identifier) return;
                    if (collection.first().type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageDeleteBulk) moduleEvent.events.messageDeleteBulk(collection);
                });
            })
        }).on("messageReactionAdd", (messageReaction, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(messageReaction.message.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (messageReaction.message.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageReactionAdd) moduleEvent.events.messageReactionAdd(messageReaction, user);
                });
            })
        }).on("messageReactionRemove", (messageReaction, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(messageReaction.message.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (messageReaction.message.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageReactionRemove) moduleEvent.events.messageReactionRemove(messageReaction, user);
                });
            })
        }).on("messageReactionRemoveAll", (message) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(message.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if(message.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageReactionRemoveAll) moduleEvent.events.messageReactionRemoveAll(message);
                });
            })
        }).on("messageUpdate", (oldMessage, newMessage) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newMessage.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (newMessage.channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.messageUpdate) moduleEvent.events.messageUpdate(oldMessage, newMessage);
                });
            })
        }).on("presenceUpdate", (oldMember, newMember) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newMember.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.presenceUpdate) moduleEvent.events.presenceUpdate(oldMember, newMember);
                });
            })
        }).on("reconnecting", () => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.reconnecting) moduleEvent.events.reconnecting();
            })
        }).on("resume", (replayed) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.resume) moduleEvent.events.resume(replayed);
            })
        }).on("roleCreate", (role) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(role.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.roleCreate) moduleEvent.events.roleCreate(role);
                });
            })
        }).on("roleDelete", (role) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(role.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.roleDelete) moduleEvent.events.roleDelete(role);
                });
            })
        }).on("roleUpdate", (oldRole, newRole) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newRole.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.roleUpdate) moduleEvent.events.roleUpdate(oldRole, newRole);
                });
            })
        }).on("typingStart", (channel, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(channel.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.typingStart) moduleEvent.events.typingStart(channel, user);
                });
            })
        }).on("typingStop", (channel, user) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(channel.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (channel.type == "text") {
                        if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    }
                    if (moduleEvent.events && moduleEvent.events.typingStop) moduleEvent.events.typingStop(channel, user);
                });
            })
        }).on("userNoteUpdate", (user, oldNote, newNote) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.userNoteUpdate) moduleEvent.events.userNoteUpdate(user, oldNote, newNote);
            })
        }).on("userUpdate", (oldUser, newUser) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.userUpdate) moduleEvent.events.userUpdate(oldUser, newUser);
            })
        }).on("voiceStateUpdate", (oldMember, newMember) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                var meta = moduleEvent.meta;
                this.getGuildConfig(newMember.guild).then(config => {
                    if (!moduleEvent.meta || !moduleEvent.meta.identifier) return;
                    if (config.disabledModules && config.disabledModules.includes(moduleEvent.meta.identifier)) return;
                    if (moduleEvent.events && moduleEvent.events.voiceStateUpdate) moduleEvent.events.voiceStateUpdate(oldMember, newMember);
                });
            })
        }).on("warn", (info) => {
            this.modulesManager.modules.forEach(moduleEvent => {
                if (moduleEvent.events && moduleEvent.events.warn) moduleEvent.events.warn(info);
            })
        })
        this.login(this.config.token);
    }

    configureForGuild(guild) {
        // Setup role guild roles
        return new Promise((resolve, reject) => {
            this.createMutedRole(guild);
            this.getGuildConfig(guild).then(config => {
                guild.getManager();
                return resolve(config);
            }).catch(e => this.log(e, true));
        });
    }

    createMutedRole(guild) {
        return new Promise((resolve, reject) => {
            var member = guild.members.get(this.user.id);
            if (member.hasPermission("MANAGE_ROLES_OR_PERMISSIONS") && this.config.muteRole && this.config.muteRole != "") {
                var roleNames = guild.roles.array().map(role => role.name);
                if (roleNames.indexOf(this.config.muteRole) === -1) {
                    guild.createRole({
                        name: this.config.muteRole,
                        color: "#ff0000",
                        permissions: ["READ_MESSAGES", "CONNECT", "READ_MESSAGE_HISTORY"],
                        hoist: false,
                        mentionable: false
                    }).then(mutedRole => {
                        guild.channels.forEach(channel => {
                            this.setMutedPermsOnChannel(channel, mutedRole);
                        });
                        resolve(guild);
                    }).catch(e => this.log(e, true));
                } else {
                    var mutedRole = this.getMuteRoleForGuild(guild);
                    guild.channels.forEach(channel => {
                        this.setMutedPermsOnChannel(channel, mutedRole);
                    });
                    resolve(guild);
                }
            } else {
                resolve(guild);
            }
        });
    }

    getGuildConfig(guild) {
        return new Promise((resolve, reject) => {
            if(!guild) return resolve(defaultGuildConfig);
            if(guild.manager && guild.manager.properties) return resolve(guild.manager.properties);
            GuildConfig.count({snowflake: guild.id}, (e, c) => {
                if(e) return resolve(defaultGuildConfig);
                
                if(c > 0) {
                    GuildConfig.findOne({snowflake: guild.id}, (e, d) => {
                        if (e) return reject(`Mongoose error:\n${e}`);
                        return resolve(d);
                    })
                } else {
                    GuildConfig.createConfig(guild.id, guild.name).then(config => {
                        return resolve(config);
                    })
                }
            });
        })
    }

    setMutedPermsOnChannel(channel, mutedRole) {
        if (!mutedRole) return
        channel.overwritePermissions(mutedRole, {
            SEND_MESSAGES: false,
            SPEAK: false
        });
    }

    getMuteRoleForGuild(guild) {
        return guild.roles.find('name', this.config.muteRole);
    }

    setStatusFromConfig() {
        return this.user.setGame(this.config.status || "Set my status!");
    }

    saveConfig() {
        fs.writeFile(`${__dirname}/config.json`, JSON.stringify(this.config, null, 4));
    }

    log(content, error = false) {
        error ?
            Logger.error(content) :
            Logger.log(content);
    }
};

Discord.Guild.prototype.getManager = function () {
    const GuildInstance = require(this.client.cwd + path.sep + "Managers" + path.sep + "GuildInstance");
    if (!this.manager) this.manager = new GuildInstance(this);
    return this.manager;
}

Discord.TextChannel.prototype.largeFetchMessages = function (limit) {
    var channel = this;
    return new Promise((resolve, reject) => {
        var retrievedMessages = [];
        function getMessages(beforeID) {
            var options = { limit: limit ? Math.min(100, Math.max(0, limit - retrievedMessages.length)) : 100 };
            options.before = beforeID
            channel.fetchMessages(options).then((messages) => {
                retrievedMessages = retrievedMessages.concat(messages.array());;
                var last = messages.last();
                if (last && (retrievedMessages.length < limit || !limit)) return setTimeout(() => { getMessages(last.id) }, 250);
                return resolve(retrievedMessages);
            }).catch((err) => {
                channel.client.log(err, true);
                resolve(retrievedMessages);
            });
        }
        getMessages(null);
    });
}