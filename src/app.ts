import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, Middleware, MemoryStorage, BotStateManager } from 'botbuilder';
import { BotFrameworkAdapter } from 'botbuilder-services';
import 'isomorphic-fetch';

const toUpper: Middleware = {
    async postActivity(context, activities, postActivity) {
        for (let activity of activities) {
            if (activity.type === 'message')
                activity.text = activity.text.toUpperCase();
        }

        return postActivity();
    }
}

declare global {
    interface ConversationState {
        count: number;
        knockknock: number;
        prompt: string;  
    }
}

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use({
        async receiveActivity(context, next) {
            if (context.request.type === 'message') {
                switch (context.state.conversation.knockknock) {
                    case undefined: {
                        if (context.request.text === 'knock knock') {
                            context.reply(`Who's there?`);
                            context.state.conversation.knockknock = 1;
                        } else {
                            await next();
                        }
                        return;
                    }

                    case 1: {
                        context.reply(`${context.request.text} who?`);
                        context.state.conversation.knockknock = 2;
                        return;
                    }

                    case 2: {
                        context.reply(`Hilarious!`);
                        context.state.conversation.knockknock = undefined;
                    }
                }
            }
        }
    })
    .use({
        async receiveActivity(context, next) {
            context.state.conversation.count = context.state.conversation.count === undefined ? 0 : context.state.conversation.count + 1;
            await next();
        }
    })
    .use({
        async receiveActivity(context, next) {
            context.reply(`${context.state.conversation.count}: start`);
            await next();
            context.reply(`${context.state.conversation.count}: end`);
        }
    })
    .use(toUpper)
    .onReceive(context => {
        context.reply('hello world');
        if (context.request.type === 'message') {
            const text = context.request.text;

            const matches = /star wars (\d+)/.exec(text);
            if (matches)
                return fetch(`https://swapi.co/api/people/${matches[1]}`)
                    .then(res => res.json())
                    .then(json => json.name)
                    .then(name => {
                        context.reply(name);
                    });

            switch(context.state.conversation.prompt) {
                case 'name': {
                    context.reply(`Nice to meet you, ${context.request.text}`);
                    context.state.conversation.prompt = undefined;
                }
            }

            if (context.request.text === 'name') {
                context.reply(`What's your name?`);
                context.state.conversation.prompt = 'name';
            }

            if (context.request.text === 'start') {
                setInterval(
                    () => {
                        bot.createContext(context.conversationReference, c => {
                            c.reply(`I am sending this in a different context`);
                        })
                    },
                    3000
                );
            }                
        }
    });

 /*
    1. Bare adapter
        * new ConsoleAdapter
        * set onReceive
        * listen
    2. Introduce Bot and context
        * responses.push, then reply
        * fetch (promises)
        * simple prompt
        * state => multi-instance state
        * count, before/after
    3. Proactive messages
    4. Middleware
        * state
        * before/after
        * toUpper (then move into functions)
        * knock knock (state-driven)
*/