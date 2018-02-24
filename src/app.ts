import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager, Middleware } from 'botbuilder';
// import { BotFrameworkAdapter } from 'botbuilder-services';
import 'isomorphic-fetch';
// import { createServer } from 'restify';
import { Topic } from './topics';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .onReceive(async context => {
        if (context.request.type === 'message') {

        }
    });

interface Profile {
    name: string;
    age: number;
    phone: string;
}

const profile = new Topic<Partial<Profile>, Partial<Profile>>('profile', {
    init(context, instance, args) {
        instance.state = args;
    }
})