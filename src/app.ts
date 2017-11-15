import { Bot, MemoryStorage, BotStateManager } from 'botbuilder-core';
import { BotFrameworkAdapter } from 'botbuilder-services';
import { createServer } from 'restify';
import { Router, tryInOrder, tryInScoreOrder, ifMatches, ifTrue, ifMessage, ifText, ifRegExp } from 'prague-botbuilder';
import { tryActiveRouter, ActiveRouter, NamedRouter } from './ActiveRouter';

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

const askName = new NamedRouter('askName', args => ifText()
    .thenDo((c, text) => {
        c.reply(`Nice to meet you, ${text}.`);
    })
    .elseDo((c, reason) => {
        c.makeThisRouterActive(args);
    })
);

const router =
    ifMessage()
        .thenTry(
            tryInOrder(
                tryActiveRouter(),
                ifRegExp(/howdy|hi|hello/i).thenDo(c =>c.reply(`Hello to you!`)),
                ifRegExp(/what time is it/i).thenDo(c => c.reply(`It's showtime.`)),
                ifRegExp(/my name is (.*)/i).thenDo((c, matches) => c.reply(`Nice to meet you, ${matches[1]}`)),
                ifRegExp(/match (.*)/i)
                    .thenTry(matches =>
                        tryInScoreOrder(
                            ifTrue(c => /bi/i.test(matches[1]) && { value: true, score: 0.5 })
                                .thenDo(c => c.reply(`I matched "bi"`)),
                            ifTrue(c => /bill/i.test(matches[1]) && { value: true, score: .75 })
                                .thenDo(c => c.reply(`I matched "bill"`))
                        )
                    ),
                ifRegExp(/interview me/i)
                    .thenDo(c => {
                        c.reply("What's your name?");
                        c.setActiveRouter(askName);
                    })
            )
            .defaultDo(c => c.reply("I will never understand you humans"))
        )
        .elseDo(c => c.reply("non-message activity"))

const bot = new Bot(adapter)
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(new ActiveRouter())
    .onReceive(c => router.route(c).toPromise());
