import { Bot, MemoryStorage, BotStateManager } from 'botbuilder-core';
import { BotFrameworkAdapter } from 'botbuilder-services';
import { createServer } from 'restify';
import { Router, tryInOrder, tryInScoreOrder, trySwitch, ifMatches, ifTrue, ifMessage, ifText, ifRegExp, ifNumber, route } from 'prague-botbuilder';
import { tryActiveRouter, ActiveRouter, NamedRouter } from './ActiveRouter';
import 'isomorphic-fetch';

// Create server
let server = createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});

// Create connector
const adapter = new BotFrameworkAdapter({ 
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

server.post('/api/messages', adapter.listen() as any);

interface Profile {
    name: string;
    age: number;
}

const interviewMe = (c: BotContext, profile = {} as Partial<Profile>) => {
    if (profile.name === undefined) {
        c.reply("What's your name?");
        return c.setActiveRouter(askForName, profile);
    }

    if (profile.age === undefined) {
        c.reply("How old are you?");        
        return c.setActiveRouter(askForAge, profile);
    }

    c.reply(`Great, your name is ${profile.name} and you are ${profile.age} years old.`)
}

const askForName = new NamedRouter<Profile>('askForName', profile => ifText()
    .thenDo((c, name) => interviewMe(c, {
        ... profile,
        name
    }))
    .elseDo(c => {
        c.reply("I'd really like to know your name.");
        c.setActiveRouter(askForName, profile);
    })
);

const askForAge = new NamedRouter<Profile>('askForAge', profile => ifNumber()
    .thenDo((c, age) => interviewMe(c, {
        ... profile,
        age
    }))
    .elseDo((c, reason) => {
        c.reply("I'd really like to know your age.");
        c.setActiveRouter(askForAge, profile);
    })
);

interface JsonResponse {
    userId: string;
    id: string;
    title: string;
    body: string;
}

const getTitle = (id: string) => fetch(`https://jsonplaceholder.typicode.com/posts/${id}`)
    .then(response => response.json())
    .then((response: JsonResponse) => response.title);

const ifTitle = (id: string) => ifMatches(c => getTitle(id));

const botLogic = (c: BotContext) => 
    trySwitch(c => c.request.type, {
        'message':
            tryInOrder(
                tryActiveRouter(),
                ifRegExp(/My name is (.+)/i)
                    .thenDo((c, matches) => c.reply(`Nice to meet you, ${matches[1]}!!`)),
                ifRegExp(/howdy|hi|hello|yo|hey|wassup/i)
                    .thenDo(c => c.reply("Hello to you")),
                ifRegExp(/title for (\d+)/i).thenTry((c, matches) =>
                    ifTitle(matches[1])
                        .thenDo((c, title) => c.reply(`The title was "${title}"`))
                        .elseDo((c, reason) => c.reply(`There is no title for ${matches[1]}.`))
                ),
                ifRegExp(/interview me/i)
                    .thenDo(c => interviewMe(c)),
            )
            .defaultDo(c => c.reply("I just don't understand you humans."))
    })
        .defaultDo(c => c.reply("Non-message activity"))
        .route(c);

const bot = new Bot(adapter)
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(new ActiveRouter())
    .onReceive(botLogic);
