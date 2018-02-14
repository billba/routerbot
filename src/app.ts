import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
// import { BotFrameworkAdapter } from 'botbuilder-services';
import 'isomorphic-fetch';
// import { createServer } from 'restify';

const adapter = new ConsoleAdapter();

adapter.listen();

// const server = createServer();
// server.listen(3978);
// const adapter = new BotFrameworkAdapter();
// server.post('api/messages', adapter.listen() as any);

const bot = new Bot(adapter);

const brackets: Middleware = {
    async receiveActivity(context, next) {
        context.reply(`{`);
        await next();
        context.reply(`}`);
    }
}

declare global {
    interface BotContext {
        swName: (id: string) => Promise<string>;
    }

    interface ConversationState {
        prompt: string;
        knockknock: number;
    }
}

const knockknock: Middleware = {
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
                    return;
                }
            }
        }
    }
}

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(brackets)
    .use({
        async contextCreated(context, next) {
            context.swName = (id: string) => fetch(`https://swapi.co/api/people/${id}`)
                .then(res => res.json())
                .then(json => json.name);

            await next();
        }
    })
    .use(knockknock)
    .use({
        async postActivity(context, activities, post) {
            for (let activity of activities) {
                if (activity.type === 'message')
                    activity.text = activity.text.toUpperCase();
            }

            return post();
        }
    })
    .onReceive(async context => {
        if (context.request.type === 'message') {
            const text = context.request.text;

            const matches = /star wars (\d+)/.exec(text);
            if (matches) {
                context.reply(await context.swName(matches[1]));
                return;
            }

            if (text === 'interview me') {
                context.reply(`What's your name?`);
                context.state.conversation.prompt = 'name';
                return;
            }

            switch (context.state.conversation.prompt) {
                case 'name': {
                    context.reply(`Nice to meet you`);
                    context.state.conversation.prompt = undefined;
                    return;
                }
            }

            context.reply(`I don't understand you humans.`);
        }
    });

    