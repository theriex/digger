/*global jtminjsDecorateWithUtilities, window, diggerapp, console */
/*jslint browser, white, long, unordered */

var jt = {};
var app = (function () {
    "use strict";

    var mgrs = {};   //app implementation support modules
    const semnd = {supnm: "sup2", domain: "diggerhub.com"};


    //docs manager handles documentation display support
    mgrs.docs = (function () {
        const pdis = [{cn:"ios", pn:"iOS", aud:"IOS"},
                      {cn:"droid", pn:"Android", aud:"Android"},
                      {cn:"node", pn:"Mac/Win/*nix", aud:"Browser"}];
        function activatePlatformSpecificDivs (docdiv) {
            const audsrc = app.svc.plat("audsrc");
            const actp = pdis.find((pdi) => pdi.aud === audsrc);
            const pods = docdiv.getElementsByClassName("platoptsdiv");
            Array.from(pods).forEach(function (pod, podi) {
                Array.from(pod.children).forEach(function (pd) {
                    pd.id=pd.className + podi; });
                const seldiv = document.createElement("div");
                seldiv.className = "platselcontdiv";
                seldiv.innerHTML = jt.tac2html(
                    ["div", {cla:"platseldiv"},
                     pdis.map((pdi) =>
                         ["div", {cla:"platseloptdiv"},
                          ["a", {href:"#" + pdi.cn,
                                 onclick:jt.fs("app.docs.displayPlat('" +
                                               pdi.cn + "'," + podi + ")")},
                           pdi.pn]])]);
                pod.prepend(seldiv);
                app.docs.displayPlat(actp.cn, podi); }); }
        function activateExpansionDivs (docdiv) {
            const xpds = docdiv.getElementsByClassName("expandiv");
            Array.from(xpds).forEach(function (xpd, xpdi) {
                const h3 = xpd.children.item(0);
                const xd = xpd.children.item(1);
                xd.id = "expandiv" + xpdi;
                h3.innerHTML = jt.tac2html(
                    [["div", {cla:"expansionindicatordiv", id:"expidiv" + xpdi},
                      ["a", {href:"#expand", id:"xptoga" + xpdi,
                             onclick:jt.fs("app.docs.togexp(" + xpdi + ")")},
                       "+"]],
                     h3.innerHTML]);
                xd.style.display = "none"; }); }
        function docDynamicContent () {
            const lut = jt.byId("privlut");
            if(lut) {
                lut.innerHTML = jt.colloquialDate(lut.innerHTML); }
            const docdiv = jt.byId("docdispdiv");
            activatePlatformSpecificDivs(docdiv);
            activateExpansionDivs(docdiv); }
    return {
        togexp: function (idx) {  //offset index within document
            const ta = jt.byId("xptoga" + idx);
            const xd = jt.byId("expandiv" + idx);
            if(ta.innerHTML.indexOf("+") >= 0) {
                ta.innerHTML = "-";
                xd.style.display = "block"; }
            else {
                ta.innerHTML = "+";
                xd.style.display = "none"; } },
        displayPlat: function (selcn, idx) {
            pdis.forEach(function (pdi) {
                const div = jt.byId(pdi.cn + idx);
                if(pdi.cn === selcn) {
                    div.style.display = "block"; }
                else {
                    div.style.display = "none"; } }); },
        displayDoc: function (divid, docurl) {  //full url or doc filename
            if(!docurl) {
                return jt.out(divid, ""); }
            jt.out(divid, "Loading " + docurl + "...");
            app.svc.docContent(docurl, function (body) {
                if(!body) {
                    body = docurl + " unavailable"; }
                if(body.indexOf("<body>") >= 0 &&
                   body.indexOf("</body>") >= 0) {
                    body = body.slice(body.indexOf("<body>") + 6,
                                      body.indexOf("</body>")); }
                const mbp = "| MANUAL | TERMS | PRIVACY | SUPPORT |";
                body = jt.tac2html(["div", {id:"docmenubardiv"}, mbp]) + body;
                body = body.replace(/src="\.\.\//g, "src=\"");  //droid etc
                body = app.docs.subPlaceholders(
                    divid, app.svc.plat("urlOpenSupp"), body);
                app.docs.docStaticContent(divid, body);
                docDynamicContent(); }); },
        subPlaceholders: function (divid, extlnk, body) {
            const dom = semnd.domain;
            const bot = "@" + dom;
            const docpre = "https://" + dom + "/docs/";
            const repls = [
                {plc:"MANUAL", txt:"Manual", url:docpre + "manual.html"},
                {plc:"TERMS", txt:"Terms", url:docpre + "terms.html"},
                {plc:"PRIVACY", txt:"Privacy", url:docpre + "privacy.html"},
                {plc:"SUPPORT", txt:"Support", url:docpre + "support.html"},
                {plc:"PRIVPOLICY", txt:"privacy policy",
                 url:docpre + "privacy.html"},
                {plc:"OPENSOURCE", txt:"open source",
                 url:"https://github.com/theriex/digger"},
                {plc:"ISSUESONGITHUB", txt:"issues on GitHub",
                 url:"https://github.com/theriex/digger/issues"},
                {plc:"SUPPEMAIL", txt:semnd.supnm + bot,
                 url:"mailto:" + semnd.supnm + bot},
                {plc:"EPINOVA", txt:"epinova.com", url:"https://epinova.com"},
                {plc:"APPLOG", txt:"Digger App Log", aa: {
                    href:"#showlog", title:"Show Digger app exec log",
                    onclick:jt.fs("app.filter.showLog('" + app.overlaydiv +
                                  "')")}},
                {plc:"SENDLOGSUPPLINK", txt:"Send it to support",
                 url:"mailto:" + semnd.supnm + bot + "?subject=" +
                 jt.dquotenc("Problem running Digger") + "&body=" +
                 jt.dquotenc(app.filter.dispatch("dcm", "emFormat")) +
                 "%0A%0A"}];
            repls.forEach(function (repl) {
                var link = repl.url;
                if(repl.aa) { //anchor attributes provided
                    link = jt.tac2html(["a", repl.aa, repl.txt]); }
                else if(link.startsWith(docpre)) {  //internal doc url
                    link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                        "app.docs.displayDoc('" + divid + "','" + link + "')")},
                                        repl.txt]); }
                else if(extlnk) {  //external links supported by UI
                    link = jt.tac2html(["a", {href:link, onclick:jt.fs(
                        "window.open('" + link + "')")}, repl.txt]); }
                else {  //links not supported
                    if(link.startsWith("mailto")) {
                        link = repl.txt; }
                    else {  //regular link
                        link = repl.txt + " (" + repl.url + ")"; } }
                body = body.replace(new RegExp(repl.plc, "g"), link); });
            return body; },
        docStaticContent: function (divid, html) {
            jt.out(divid, jt.tac2html(
                ["div", {id:"docdispdiv"},
                 [["div", {id:"docdispxdiv"},
                   ["a", {href:"#close",
                          onclick:jt.fs("app.docs.displayDoc('" + divid +
                                        "')")},
                    "X"]],
                  ["div", {id:"docdispbodydiv"}, html]]])); },
        //divdesc can be a string divid to display/hide, or a toggle group spec:
        // {rootids:[srcdivroot, srcdivroot2...]
        //  clicked:srcdivroot}
        //The toggleable content group clicked element is "tcgc" + srcdivroot
        //The toggleable content group display element is "tcgd" + srcdivroot
        //Clicked elements have "tcgcactive" or "tcgcinactive" classes added
        togdivdisp: function (divdesc, display) {
            var dispelem = null;
            if(divdesc.rootids) {
                dispelem = jt.byId("tcgd" + divdesc.clicked); }
            else {
                dispelem = jt.byId(divdesc); }
            if(!display) {
                display = dispelem.style.display;
                if(display === "none") {
                    display = "block"; }
                else {
                    display = "none"; } }
            if(divdesc.rootids) {
                divdesc.rootids.forEach(function (rid) {
                    var tcgce = jt.byId("tcgc" + rid);
                    var tcgde = jt.byId("tcgd" + rid);
                    if(rid === divdesc.clicked) {
                        tcgce.classList.remove("tcgcinactive");
                        tcgce.classList.add("tcgcactive");
                        tcgde.style.display = display; }
                    else {
                        if(display === "block") {
                            tcgce.classList.add("tcgcinactive"); }
                        else {
                            tcgce.classList.remove("tcgcinactive"); }
                        tcgce.classList.remove("tcgcactive");
                        tcgde.style.display = "none"; } }); }
            else {
                dispelem.style.display = display; } }
    };  //end mgrs.docs returned access interface
    }());


    //boot manager handles code loading and initialization
    mgrs.boot = (function () {
        var amits = [];  //apres modules init tasks
        const slib = {wms:50,  //support lib wait millis (doubles on retry)
                      tmo:null};
        const amdtimer = {load:{}, appinit:{}, diggerinit:{}};
        function globkey (e) {
            if(e && (e.charCode === 32 || e.keyCode === 32)) {  //space bar
                const edtags = ["textarea", "input"];
                const tname = e.target.tagName;
                if(tname && edtags.indexOf(tname.toLowerCase()) < 0) {
                    if(app.spacebarhookfunc) {
                        app.spacebarhookfunc(); } } } }
        function nextApresModulesInitTask () {
            setTimeout(function () {
                if(amits.length) {
                    const task = amits.shift();
                    jt.log("nextApresModulesInitTask " + task.name);
                    task.tf();
                    nextApresModulesInitTask(); } }, 50); }
    return {
        addApresModulesInitTask: function (taskname, taskfunction) {
            amits.push({name:taskname, tf:taskfunction}); },
        initDiggerModules: function () {
            //diggerapp is defined globally by index.html
            amdtimer.diggerinit.start = new Date();
            diggerapp.modules.forEach(function (md) {
                if(md.type === "dm") {
                    app[md.name].init(); } });
            nextApresModulesInitTask();
            amdtimer.diggerinit.end = new Date(); },
        initAppModules: function () {
            const now = new Date();
            if(!amdtimer.load.end) {
                amdtimer.load.end = now; }
            amdtimer.appinit.start = now;
            jt.log = console.log;  //overridden again in filter.dcm.init
            jt.log("window.innerWidth/Height: " + window.innerWidth + " x " +
                   window.innerHeight);
            jt.on(document, "keydown", globkey);
            app.startParams = jt.parseParams("String");
            app.startPath = window.location.pathname.toLowerCase();
            if(diggerapp.context === "local" || app.startPath === "/digger") {
                if(diggerapp.context === "web") {
                    jt.byId("topsectiondiv").style.display = "none"; }
                jt.out("outercontentdiv", jt.tac2html(
                    ["div", {id:"contentframingdiv"},
                     ["div", {id:"contentmargindiv"},
                      ["div", {id:"contentdiv"},
                       [["div", {cla:"paneldiv", id:"pantopdiv"}],
                        ["div", {cla:"paneldiv", id:"panplaydiv"}],
                        ["div", {cla:"paneldiv", id:"pandeckdiv"}],
                        ["div", {id:"appoverlaydiv"}]]]]]));
                if(app.startPath === "/digger") {  //web startup needs auth info
                    app.login.init(false); }  //calls initDiggerModules
                else {
                    app.boot.initDiggerModules(); } }
            else if(diggerapp.context === "web") {
                app.login.init(); }
            amdtimer.appinit.end = new Date(); },
        loadCodeModules: function () {
            var ox = window.location.href;
            if(!diggerapp.context === "web") {
                if((ox.toLowerCase().indexOf("https:") !== 0) &&  //not secure
                   (ox.search(/:\d080/) < 0)) {  //and not local dev
                    window.location.href = "https:" + ox.slice(ox.indexOf("/"));
                    return; } }  //stop and let the redirect happen.
            if(ox.indexOf("android") >= 0) {
                app.docroot = "https://appassets.androidplatform.net/assets/"; }
            else if(ox.indexOf("diggerIOS.app") >= 0) {
                app.docroot = ox.slice(0, ox.lastIndexOf("/")); }
            else {
                app.docroot = ox.split("/").slice(0, 3).join("/") + "/"; }
            if(typeof(jtminjsDecorateWithUtilities) !== "function") {
                if(slib.tmo) {
                    clearTimeout(slib.tmo);
                    slib.tmo = null; }
                slib.wms = slib.wms * 2;
                const bsd = document.getElementById("bootstatdiv");
                if(bsd) {
                    bsd.innerHTML = "Support library load retry in " +
                        (slib.wms / 1000) + " seconds..."; }
                slib.tmo = setTimeout(app.init, slib.wms);
                return; }
            jtminjsDecorateWithUtilities(jt);
            jt.out("bootstatdiv", "Loading app modules...");
            const loadfs = diggerapp.modules.map((p) => "js/amd/" + p.name);
            amdtimer.load.start = new Date();
            jt.loadAppModules(app, loadfs, app.docroot, 
                              mgrs.boot.initAppModules, "?v=250322"); }
    }; //end mgrs.boot returned access interface
    }());


    //util manager handles app utility functions common across modules
    mgrs.util = (function () {
    return {
        //Convert an argument list to a string of arguments suitable for
        //appending to manager dispatch on___ function text.
        paramstr: function (args) {
            var ps = "";
            if(args && args.length) {
                ps = args.reduce(function (acc, arg) {
                    if((typeof arg === "string") && (arg !== "event")) {
                        arg = "'" + arg + "'"; }
                    return acc + "," + arg; }, ""); }  //always start with comma
            return ps; },
        //Dispatch function string.  Return an on___ function string.
        dfs: function (module, mgrfname, args) {
            var pstr = app.util.paramstr(args); var fstr;
            mgrfname = mgrfname.split(".");
            fstr = "app." + module + ".dispatch('" + mgrfname[0] + "','" +
                mgrfname[1] + "'" + pstr + ")";
            if(pstr !== ",event") {  //don't return false from event hooks
                fstr = jt.fs(fstr); }
            return fstr; },
        //make a cache busted url out of the endpoint and params
        cb: function (endpoint, params, toklev) {
            var url = endpoint + "?";
            toklev = toklev || "second";
            params = params || "";
            if(typeof params === "object") {
                params = jt.objdata(params); }
            if(params) {
                url += params + "&"; }
            url += jt.ts("cb=", toklev);
            return url; },
        //return obj post data, with an/at added
        authdata: function (obj) {
            var digacc = app.top.dispatch("aaa", "getAccount");
            var authdat = jt.objdata({an:digacc.email, at:digacc.token});
            if(obj) {
                authdat += "&" + jt.objdata(obj); }
            return authdat; },
        //return true if the current user is signed in on DiggerHub
        haveHubCredentials: function () {
            var digacc = app.top.dispatch("aaa", "getAccount");
            if(digacc && digacc.dsId !== "101" && digacc.token &&
               app.top.dispatch("ppc", "policyAccepted")) {
                return true; }
            return false; },
        //app.docroot is initialized with a terminating '/' so it can be
        //concatenated directly with a relative path, but remembering and
        //relying on whether a slash is required is annoying.  Double slashes
        //are usually handled properly but can be a source of confusion, so this
        //strips off any preceding slash in the relpath.
        dr: function (relpath) {
            if(relpath.startsWith("/")) {
                relpath = relpath.slice(1); }
            return app.docroot + relpath; },
        //Extract plain text from errmsg.  Controlled server errors return
        //reasonable text errors, but server crashes and anything handled by the
        //container may return full html pages which take up huge space in the 
        //UI when rendered.  This logs the original and returns best guess text.
        pt: function (errmsg) {
            errmsg = errmsg || "";
            const lcmsg = errmsg.toLowerCase();
            if(lcmsg.indexOf("<html") >= 0) {
                jt.log("app.util.pt original html errmsg: " + errmsg);
                const hidx = lcmsg.indexOf("<h1>");
                if(hidx >= 0) {
                    errmsg = errmsg.slice(hidx + 4);
                    const ci = errmsg.indexOf("</");
                    if(ci >= 0) {
                        errmsg = errmsg.slice(0, ci); } }
                jt.log("app.util.pt returning: " + errmsg); }
            return errmsg; },
        //copy field values from srcSong into destSong. Argument order similar
        //to Object.assign
        copyUpdatedSongData: function (destSong, srcSong) {
            const songfields = ["dsType", "batchconv", "aid", "ti", "ar", "ab",
                                "el", "al", "kws", "rv", "fq", "lp", "nt",
                                "pc", "pd", "dsId", "modified", "locmod"];
            songfields.forEach(function (fld) {
                if(srcSong.hasOwnProperty(fld)) {  //don't copy undefined values
                    destSong[fld] = srcSong[fld]; } }); },
        //!UNPACKED BY appdat.py unescape_song_fields
        //Even a serialized song can run afoul of web security rules due to
        //paths, titles or other fields containing parenthetical expressions or
        //other triggering patterns.  For UPLOAD, remove any problematic temp
        //fields and escape whatever triggers security blocks.
        txSong: function (song) {
            var delflds = ["mrd", "smti", "smar", "smab", "locmod"];
            //THIS MUST MATCH appdat.py unescape_song_fields
            var escflds = ["path", "ti", "ar", "ab", "nt"];
            //Web Security Reserved Words that must be escaped to be let through
            var wsrw = ["having", "select", "union", "within"];
            song = JSON.parse(JSON.stringify(song));
            delflds.forEach(function (fld) { delete song[fld]; });
            escflds.forEach(function (fld) {  //replace parens with HTML chars
                if(song[fld]) {
                    song[fld] = song[fld].replace(/\(/g, "ESCOPENPAREN");
                    song[fld] = song[fld].replace(/\)/g, "ESCCLOSEPAREN");
                    song[fld] = song[fld].replace(/'/g, "ESCSINGLEQUOTE");
                    song[fld] = song[fld].replace(/&/g, "ESCAMPERSAND");
                    wsrw.forEach(function (rw) {
                        song[fld] = song[fld].replace(
                            new RegExp(rw, "gi"), function (match) {
                                const rev = match.split("").reverse().join("");
                                return "WSRW" + rev; }); });
                } });
            return song; }
    }; //end mgrs.util returned access interface
    }());
    

    //Demo data handler for simulator screenshots
    mgrs.scr = (function () {
        const platconf = {
            hdm: "loc",   //host data manager is local
            musicPath: "fixed",  //can't change where music files are
            dbPath: "fixed",  //rating info is only kept in app files
            urlOpenSupp: "false",  //opening a tab break webview
            defaultCollectionStyle: "",   //not permanentCollection
            audsrc: "Demo",
            versioncode: "vx.x.x" };
        const pbi = { sq:[], idx:-1 };  //playback info: song queue and index
        const pbstat = {path:"", state:"", pos:0, dur:0};
        var songdat = null;  //working space for song data
        var ratedSongs = false;
        //var idctr = 1001;
        const kwdefs = {Social: {pos: 1, sc: 0, ig: 0, dsc: ""},
                        Personal: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Office: {pos: 4, sc: 0, ig: 0, dsc: ""},
                        Dance: {pos: 2, sc: 0, ig: 0, dsc: ""},
                        Ambient: {pos: 3, sc: 0, ig: 0, dsc: ""},
                        Jazz: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Classical: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Talk: {pos: 0, sc: 0, ig: 0, dsc: ""},
                        Solstice: {pos: 0, sc: 0, ig: 0, dsc: ""}};
        // const settings = {
        //     "ctrls": [{"tp": "range", "c": "al", "x": 27, "y": 62},
        //               {"tp": "range", "c": "el", "x": 49, "y": 47},
        //               {"tp": "kwbt", "k": "Social", "v": "pos"},
        //               {"tp": "kwbt", "k": "Dance", "v": "off"},
        //               {"tp": "kwbt", "k": "Ambient", "v": "neg"},
        //               {"tp": "kwbt", "k": "Office", "v": "pos"},
        //               {"tp": "minrat", "u": 0, "m": 5},
        //               {"tp": "fqb", "v": "on"}],
        //     "waitcodedays": {"B": 90, "Z": 180, "O": 365}};
        const dfltacct = {
            dsType:"DigAcc", dsId:"101", firstname:"Digger",
            created:"2019-10-11T00:00:00Z",
            modified:"2019-10-11T00:00:00Z;1",
            email:(semnd.supnm + "@" + semnd.domain), token:"none",
            hubdat:"", "kwdefs": kwdefs,
            igfolds:["Ableton","GarageBand"],
            //"settings": "";
            musfs:""};
        // const demoacct = {
        //     "dsType":"DigAcc", "dsId":"1234",
        //     "created":"2021-01-26T17:21:11Z",
        //     "modified":"2023-02-13T22:58:45Z;13139", "batchconv":"",
        //     "email":"demo@example.com", "token":"faketokentoshowsignedin",
        //     "hubdat":"{\"privaccept\": \"2022-06-11T14:11:14.284Z\"}",
        //     "status":"Active", "firstname":"Demo", "digname":"Demo",
        //     "kwdefs": kwdefs,
        //     "igfolds": ["Ableton","GarageBand"],
        //     "settings": settings,
        //     "musfs": [
        //         {"dsId":"1235", "digname":"afriend", "firstname":"A Friend",
        //          "added":"2022-06-10T21:30:21Z",
        //          "lastpull":"2023-02-13T00:38:48Z",
        //          "lastheard":"2022-11-06T18:42:48Z",
        //          "common": 7086, "dfltrcv": 57, "dfltsnd": 5294},
        //         {"dsId":"1236", "digname":"bfriend", "firstname":"B Friend",
        //          "added":"2022-07-10T21:30:21Z",
        //          "lastpull":"2023-02-20T00:38:48Z",
        //          "lastheard":"2023-02-15T18:42:48Z",
        //          "common": 556, "dfltrcv": 87, "dfltsnd": 5},
        //         {"dsId":"1237", "digname":"cfriend", "firstname":"C Friend",
        //          "added":"2022-07-10T21:30:21Z",
        //          "lastpull":"2023-02-20T00:38:48Z",
        //          "lastheard":"2023-01-03T18:42:48Z",
        //          "common": 556, "dfltrcv": 87, "dfltsnd": 42},
        //         {"dsId":"1238", "digname":"fabDJ", "firstname":"Fab DJ",
        //          "added":"2022-08-10T21:30:21Z",
        //          "lastpull":"2022-08-10T21:30:48Z",
        //          "lastheard":"2023-02-14T18:42:48Z",
        //          "common": 8645, "dfltrcv": 986, "dfltsnd": 0}]};
        const albdat = {
            "Brian Eno":{
                "Ambient 1: Music for Airports":{
                    kwds:"Social,Office,Ambient", songs:[
                        "1/1",
                        "2/1",
                        "1/2",
                        "2/2"]}},
            "Gil Scott-Heron":{
                "The Revolution Will Not Be Televised":{
                    kwds:"Social", songs:[
                        "The Revolution Will Not Be Televised",
                        "Sex Education_ Ghetto Style",
                        "The Get Out of the Ghetto Blues",
                        "No Knock",
                        "Lady Day and John Coltrane",
                        "Pieces of a Man",
                        "Home Is Where the Hatred Is",
                        "Brother",
                        "Save the Children",
                        "Whitey on the Moon [Explicit]",
                        "Did You Hear What They Said?"]}},
            "Kraftwerk":{
                "Autobahn":{
                    kwds:"Social,Office", songs:[
                        "Autobahn",
                        "Kometenmelodie 1",
                        "Kometenmelodie 2",
                        "Mitternacht",
                        "Morgenspaziergang"]}},
            "Talking Heads":{
                "Remain In Light":{
                    kwds:"Social,Office", songs:[
                        "Born Under Punches (The Heat Goes On)",
                        "Crosseyed And Painless",
                        "The Great Curve",
                        "Once In A Lifetime",
                        "Houses In Motion",
                        "Seen And Not Seen",
                        "Listening Wind",
                        "The Overload"]}},
            "Joan Armatrading":{
                "Walk Under Ladders":{
                    kwds:"Social,Office", songs:[
                        "I'm Lucky",
                        "When I Get It Right",
                        "Romancers",
                        "I Wanna Hold You",
                        "The Weakness In Me",
                        "No Love",
                        "At The Hop",
                        "I Can't Lie To Myself",
                        "Eating The Bear",
                        "Only One"]}},
            "Miles Davis":{
                "Star People":{
                    kwds:"Social,Office", songs:[
                        "Come Get It",
                        "It Gets Better",
                        "Speak",
                        "Star People",
                        "U'n'I",
                        "Star On Cicely"]}},
            "Ozomatli":{
                "Street Signs":{
                    kwds:"Social,Office", songs:[
                        "Believe",
                        "Love And Hope",
                        "Street Signs",
                        "(Who Discovered) America?",
                        "Who's To Blame",
                        "Te Estoy Buscando",
                        "Saturday Night",
                        "Déjame En Paz",
                        "Santiago",
                        "Ya Viene El Sol [The Beatle Bob Remix]",
                        "Doña Isabelle",
                        "Nadie Te Tira",
                        "Cuando Canto"]}},
            "Pizzicato Five":{
                "女性上位時代":{
                    kwds:"Social,Office", songs:[
                        "女性上位時代#4",
                        "私のすべて",
                        "お早よう",
                        "サンキュー",
                        // "大人になりましょう",
                        // "女性上位時代#5",
                        // "ベイビィ・ラヴ・チャイルド",
                        // "トゥイギー・トゥイギー",
                        // "トゥイギー対ジェイムズボンド",
                        // "神様がくれたもの",
                        // "パーティー",
                        // "しりとりをする恋人たち",
                        // "マーブル・インデックス",
                        // "きみになりたい",
                        // "むずかしい人",
                        "TOKYO'S COOLEST SOUND",
                        "クールの誕生",
                        "女性上位時代#6"]}},
            "The KLF":{
                "Chill Out":{
                    kwds:"Social,Office,Ambient", songs:[
                        "Brownsville Turnaround on the Tex-Mex Border",
                        "Pulling Out of Ricardo and the Dusk Is Falling Fast",
                        "Six Hours to Louisiana, Black Coffee Going Cold",
                        "Dream Time in Lake Jackson",
                        "Madrugada Eterna",
                        "Justfied and Ancient Seems a Long Time Ago",
                        "Elvis on the Radio, Steel Guitar in My Soul",
                        "3 A.M. Somewhere Out of Beaumont",
                        "Wichita Lineman Was a Song I Once Heard",
                        "Trancentral Lost in My Mind",
                        "The Lights of Baton Rouge Pass By",
                        "A Melody from a Past Life Keeps Pulling Me Back",
                        "Alone Again With the Dawn Coming Up"]}},
            "Kate Bush":{
                "Hounds of Love":{
                    kwds:"Social", songs:[
                        "Running Up That Hill (A Deal With God)",
                        "Hounds Of Love",
                        "The Big Sky",
                        "Mother Stands For Comfort",
                        "Cloudbusting",
                        "And Dream Of Sheep",
                        "Under Ice",
                        "Waking The Witch",
                        "Watching You Without Me",
                        "Jig Of Life",
                        "Hello Earth",
                        "The Morning Fog"]}},
            "Deep Forest":{
                "Deep Forest":{
                    kwds:"Social,Office", songs:[
                        "Deep Forest",
                        "Sweet Lullaby",
                        "Hunting",
                        "Night Bird",
                        "The First Twilight",
                        "Savana Dance",
                        "Desert Walk",
                        "White Whisper",
                        "The Second Twilight",
                        "Sweet Lullaby (Ambient Mix)",
                        "Forest Hymn"]}},
            "Cocteau Twins":{
                "Blue Bell Knoll":{
                    kwds:"Social,Office", songs:[
                        "Blue Bell Knoll",
                        "Athol-Brose",
                        "Carolyn's Fingers",
                        "For Phoebe Still a Baby",
                        "The Itchy Glowbo Blow",
                        "Cico Buff",
                        "Suckling the Mender",
                        "Spooning Good Singing Gum",
                        "A Kissed Out Red Floatboat",
                        "Ella Megalast Burls Forever"]}}};
        // const acctmsgs = [
        //     //bfriend thanks for sharing Song P
        //     {sndr:"1236", rcvr:"1234", msgtype:"shresp",
        //      created:"2023-01-03T20:42:12.074Z", status:"open",
        //      srcmsg:"fake", songid:"fake",
        //      ti:"Song P", ar:"Artist P", ab:"Album P"},
        //     //afriend great Song G - Awesome bassline
        //     {sndr:"1235", rcvr:"1234", msgtype:"share",
        //      created:"2023-01-04T20:42:12.074Z", status:"open",
        //      srcmsg:"", songid:"fake",
        //      ti:"Song G", ar:"Artist G", ab:"Album G",
        //      nt:"Awesome bassline"},
        //     //fabDJ recommends Song J
        //     {sndr:"1238", rcvr:"1234", msgtype:"recommendation",
        //      created:"2023-01-05T20:42:12.074Z", status:"open",
        //      srcmsg:"", songid:"fake",
        //      ti:"Song J", ar:"Artist J", ab:"Album J",
        //      nt:"Super sticky original groove"},
        //     //cfriend thanks for recommending Song X
        //     {sndr:"1237", rcvr:"1234", msgtype:"recresp",
        //      created:"2023-01-06T20:42:12.074Z", status:"open",
        //      srcmsg:"fake", songid:"fake",
        //      ti:"Song X", ar:"Artist X", ab:"Album X"},
        //     //afriend Song S - Melody gets stuck in my head every time.
        //     {sndr:"1235", rcvr:"1234", msgtype:"share",
        //      created:"2023-01-07T20:42:12.074Z", status:"open",
        //      srcmsg:"", songid:"fake",
        //      ti:"Song S", ar:"Artist S", ab:"Album S",
        //      nt:"Melody gets stuck in my head every time."}];
        const rets = {  //holder object for literal and calculated return vals
            readConfig:{"acctsinfo": {currid:"101",
                                      //accts:[dfltacct, demoacct]}},
                                      accts:[dfltacct]}}};
        function timestampMinusSeconds (secs) {
            const tms = Date.now() - (secs * 1000);
            return new Date(tms).toISOString(); }
        // function nextFakeDbId () {
        //     const retval = "fkdb" + idctr;
        //     idctr += 1;
        //     return retval; }
        function addDemoSong (ar, ab, ti, idx, kwds, lastplayed) {
            var tn = idx + 1;
            if(tn < 10) {
                tn = "0" + tn; }
            const path = ar + "/" + ab + "/" + tn + " " + ti + ".mp3";
            const mrd = ["C", ti, ar, ab].join("|");
            songdat[path] = {
                "fq":"N", "al":49, "el":49, "rv":5, "kws":"", lp:lastplayed,
                "path":path, "mrd":mrd, "ar":ar, "ab":ab, "ti":ti };
            if(ratedSongs) {
                songdat[path].al = 40;
                songdat[path].el = 70;
                songdat[path].rv = 8;
                songdat[path].kws = kwds;
                songdat[path].fq = "B";  //light up tuning fork
                songdat[path].nt = "Placeholder comment to light indicator"; } }
        function getSongData () {
            if(songdat) { return songdat; }
            jt.log("building fake song data, ratedSongs: " + ratedSongs);
            const lpbase = Date.now() - 91 * 24 * 60 * 60 * 1000;
            songdat = {};
            Object.entries(albdat).forEach(function ([ar, albobj], ari) {
                //jt.log("scr.getSongData " + ari + ": " + ar);
                const lp = new Date(lpbase + ari * 60 * 60 * 1000)
                      .toISOString();
                Object.entries(albobj).forEach(function ([ab, detobj]) {
                    detobj.songs.forEach(function (ti, idx) {
                        addDemoSong(ar, ab, ti, idx, detobj.kwds,
                                    lp); }); }); });
            return songdat; }
        function makeDigDat () {
            const sd = getSongData();
            const scantsecs = 32 * 24 * 60 * 60;  //max modified is 31 days ago
            rets.readDigDat = {
                "version": "v1.2.5",  //last screenshot update version
                "scanned": timestampMinusSeconds(scantsecs),  //< modified
                "songcount": Object.keys(sd).length,
                "songs": sd,
                "scanstart": timestampMinusSeconds(scantsecs + 2)}; }
        function makeMediaRead () {
            const sd = getSongData();
            var mr = [];
            Object.values(sd).forEach(function (s) {
                const si = {path:s.path, artist:s.ar, album:s.ab, title:s.ti,
                            lp:s.lp};
                si.data = s.path;  //android wants path in 'data' field
                mr.push(si); });
            rets.requestMediaRead = JSON.stringify(mr); }
        function sendPlaybackStatus () {
            setTimeout(function () {
                app.player.dispatch("uiu", "receivePlaybackStatus", pbstat); },
                       50); }
    return {
        //service override functions
        plat: function (key) { return platconf[key]; },
        readConfig: function (contf/*, errf*/) {
            contf(rets.readConfig); },
        readDigDat: function (contf/*, errf*/) {
            contf(rets.readDigDat); },
        writeConfig: function (config, ignore/*optobj*/, contf/*, errf*/) {
            rets.readConfig = config;
            setTimeout(function () {
                contf(rets.readConfig); }, 50); },
        writeDigDat: function (dbo, ignore/*optobj*/, contf/*, errf*/) {
            rets.readDigDat = dbo;
            setTimeout(function () {
                contf(rets.readDigDat); }, 50); },
        playSongQueue: function (ignore /*pwsid*/, sq) {
            pbi.sq = sq;
            pbi.idx = 0;
            const np = app.pdat.songsDict()[pbi.sq[0].path];
            np.lp = new Date().toISOString();
            np.pd = "played";
            setTimeout(function () {  //let play call go, then tick
                //use the main messaging utility for call sequencing.
                app.player.dispatch("uiu", "requestPlaybackStatus", "scr.play",
                    function (status) {
                        jt.log("scr.playSongQueue requestPlaybackStatus " +
                               JSON.stringify(status)); }); }, 50); },
        requestPlaybackStatus: function () {
            if(pbi.idx >= 0) {
                pbstat.path = pbi.sq[pbi.idx].path;
                pbstat.state = "playing";
                pbstat.pos = 12*1000;
                pbstat.dur = ((3*60) + 34)*1000; }
            sendPlaybackStatus(); },
        passthroughHubCall: function (qname, reqnum, endpoint, verb) {
            jt.log("app.scr.passthroughHubCall no support for " + qname +
                   " " + reqnum + " " + verb + " " + endpoint); },
        copyToClipboard: function (txt, contf/*, errf*/) {
            jt.log("app.scr.copyToClipboard ignored " + txt);
            contf(); },
        docContent: function (/*du, cf*/) {
            jt.log("app.scr.docContent not supported"); },
        topLibActionSupported: function (act) {
            const unsupp = {
                "updversionnote":"app store updates lag behind server updates",
                "ignorefldrsbutton":"No music file folders",
                "readfilesbutton":"All media queried at app startup"};
            return (!act.id || !unsupp[act.id]); },
        extensionInterface: function (/*name*/) { return null; },
        //player.plui pbco interface functions:
        pause: function () {
            pbstat.state = "paused";
            sendPlaybackStatus(); },
        resume: function () {
            pbstat.state = "playing";
            sendPlaybackStatus(); },
        seek: function (ms) {
            pbstat.pos = ms;
            sendPlaybackStatus(); },
        //specific platform initialization takeover lag callbacks
        iosReturn: function (retval) {
            jt.log("app.scr.iosReturn ignoring " + retval); },
        //screenshot stubbed interface activation
        replaceSvcWithUIStubInterface: function () {
            app.svc = mgrs.scr;  //take over all platform calls
            app.pdat.clearApresDataNotificationTask("svc.loc.loadLibrary");
            ratedSongs = true;
            makeDigDat();
            makeMediaRead();
            app.deck.dispatch("srch", "setSearchQueryString", "Me");
            app.boot.addApresModulesInitTask("scr.init", function () {
                app.player.dispatch("plui", "initInterface", mgrs.scr); }); }
    };  //end mgrs.scr returned access interface
    }());


    //persistent data manager handles reading, writing, runtime caching, and
    //update notifications for configuration and song data.
    mgrs.pdat = (function () {
        const rtdat = {
            config:{datobj:null, qcs:[], listeners:[]},   //.digger_config.json
            digdat:{datobj:null, qcs:[], listeners:[]}};  //digdat.json
        var adnts = [];  //apres data notification tasks
        var tiarab = null;  //alt dict for song lookup by title artist album
        function nextApresDataTask () {
            setTimeout(function () {
                if(adnts.length) {
                    const task = adnts.shift();
                    jt.log("nextApresDataTask " + task.name);
                    task.tf();
                    nextApresDataTask(); } }, 50); }
        function notifyUpdateListeners (pwsid, type) {
            rtdat[type].listeners.forEach(function (listener) {
                if(listener.pwsid !== pwsid) {  //don't loop back to writer
                    try {  //continue if any one listener fails
                        listener.cbf(rtdat[type].datobj);
                    } catch(e) {
                        jt.log("notifyUpdateListeners " + type + " from " +
                               pwsid + " continuing after listener failure " +
                               e.stack);
                    } } });
            if(type === "digdat") {
                nextApresDataTask(); } }
        function verifyBaseObject (val) {
            val = val || {};
            if(typeof val !== "object") {
                jt.log("pdat.verifyBaseObject resetting non-object val" + val);
                val = {}; }
            return val; }
        function setConfigAndNotify (pwsid, config) {
            config = verifyBaseObject(config);
            rtdat.config.datobj = config;
            notifyUpdateListeners(pwsid, "config"); }
        function setDigDatAndNotify (pwsid, digdat) {
            try {
                digdat = verifyBaseObject(digdat);
                const stat = app.top.dispatch("dbc", "verifyDatabase", digdat);
                if(!stat.verified) {  //note issue(s) and try continue
                    jt.log("setDigDatAndNotify verifyDatabase errors: " +
                           JSON.stringify(stat)); }
                rtdat.digdat.datobj = digdat;
                notifyUpdateListeners(pwsid, "digdat");
            } catch(e) {
                jt.log("setDigDatAndNotify failed " + e.stack); } }
        function dequeueOrFinish(fname, qdat) {
            rtdat[qdat].phase = "ready";
            if(rtdat[qdat].qcs.length) {
                jt.log("pdat." + fname + " processing next in queue");
                const qc = rtdat[qdat].qcs.shift();
                app.pdat[fname](qc.call, qc.opt, qc.cbf, qc.errf); } }
    return {
        //persistent data access interface:
        addConfigListener: function (writesrcid, callbackf) {
            rtdat.config.listeners.push({pwsid:writesrcid, cbf:callbackf}); },
        addDigDatListener: function (writesrcid, callbackf) {
            rtdat.digdat.listeners.push({pwsid:writesrcid, cbf:callbackf}); },
        writeConfig: function (callerstr, optobj, contf, errf) {
            const lpx = "pdat.writeConfig " + (callerstr || "Unknown") + " ";
            rtdat.config.phase = rtdat.config.phase || "ready";
            if(rtdat.config.phase === "callbacks") {
                const msg = "Recursive " + lpx + "call from callback";
                jt.log(msg);
                throw new Error(msg); }
            if(rtdat.config.phase === "calling") {
                rtdat.config.qcs.push({call:callerstr, opt:optobj,
                                       cbf:contf, ef:errf});
                return jt.log(lpx + "call queued"); }
            rtdat.config.phase = "calling";
            jt.log(lpx + "starting call");
            app.svc.writeConfig(rtdat.config.datobj, optobj,
                function (writtenconf) {
                    rtdat.config.phase = "callbacks";
                    jt.log(lpx + "processing callback notifications");
                    if(contf) {
                        contf(writtenconf); }
                    setConfigAndNotify(callerstr, writtenconf);
                    jt.log(lpx + "call completed");
                    dequeueOrFinish("writeConfig", "config"); },
                function (code, errtxt) {
                    jt.log(lpx + "error " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); }
                    dequeueOrFinish("writeConfig", "config"); }); },
        writeDigDat: function (callerstr, optobj, contf, errf) {
            const lpx = "pdat.writeDigDat " + (callerstr || "Unknown") + " ";
            rtdat.digdat.phase = rtdat.digdat.phase || "ready";
            if(rtdat.digdat.phase === "callbacks") {
                const msg = "Recursive " + lpx + "call from callback";
                jt.log(msg);
                throw new Error(msg); }
            if(rtdat.digdat.phase === "calling") {
                rtdat.digdat.qcs.push({call:callerstr, opt:optobj,
                                       cbf:contf, ef:errf});
                return jt.log(lpx + "call queued"); }
            rtdat.digdat.phase = "calling";
            jt.log(lpx + "starting call");
            tiarab = null;  //alt songs dict no longer valid
            rtdat.digdat.datobj.awts = new Date().toISOString(); //app write ts
            app.svc.writeDigDat(rtdat.digdat.datobj, optobj,
                function (writtendbo) {
                    rtdat.digdat.phase = "callbacks";
                    jt.log(lpx + "processing callback notifications");
                    if(contf) {
                        try {
                            contf(writtendbo);
                        } catch(e) {
                            jt.log("writeDigDat contf failed " + e.stack);
                        } }
                    setDigDatAndNotify(callerstr, writtendbo);
                    jt.log(lpx + "call completed");
                    dequeueOrFinish("writeDigDat", "digdat"); },
                function (code, errtxt) {
                    jt.log(lpx + "error " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); }
                    dequeueOrFinish("writeDigDat", "digdat"); }); },
        //data coordination work management
        addApresDataNotificationTask: function (taskname, taskfunction) {
            adnts.push({name:taskname, tf:taskfunction}); },
        clearApresDataNotificationTask: function (taskname) {
            adnts = adnts.filter((t) => t.name !== taskname); },
        svcModuleInitialized: function () {
            //app.scr.replaceSvcWithUIStubInterface();  //for screenshots..
            //svc is responsible for returning up-to-date config and digdat
            //data, including updated song.lp values if available.
            setTimeout(function () {  //finish intitialization call stack
                const logpre = "pdat.svcModuleInitialized ";
                jt.log(logpre + "calling readConfig");
                app.svc.readConfig(  //load config first
                    function (config) {
                        jt.log(logpre + "calling setConfigAndNotify");
                        setConfigAndNotify("svcinit", config);
                        jt.log(logpre + "config done, calling readDigDat");
                        app.svc.readDigDat(  //load digdat after config avail
                            function (digdat) {
                                jt.log(logpre + "calling setDigDatAndNotify");
                                setDigDatAndNotify("svcinit", digdat);
                                jt.log(logpre + "complete"); },
                            function (code, errtxt) {
                                jt.err(logpre + "readDigDat error" + code +
                                       ": " + errtxt); }); },
                    function (code, errtxt) {
                        jt.err(logpre + "readConfig error " + code + ": " +
                               errtxt); }); }, 50); },
        reloadDigDat: function () {
            jt.log("pdat.reloadDigDat setting timeout");
            setTimeout(function () {
                app.svc.readDigDat(
                    function (digdat) {
                        jt.log("pdat.reloadDigDat complete. Notifying.");
                        setDigDatAndNotify("reloadDigDat", digdat); },
                    function (code, errtxt) {
                        jt.err("pdat.reloadDigDat " + code + ": " +
                               errtxt); }); }, 50); },
        //convenience accessors (after data available)
        dbObj: function () { return rtdat.digdat.datobj; },
        configObj: function () { return rtdat.config.datobj; },
        songDataVersion: function () { return rtdat.digdat.datobj.version; },
        songsDict: function () { return rtdat.digdat.datobj.songs || {}; },
        tiarab: function () {
            if(!tiarab) {
                tiarab = {};
                Object.values(app.pdat.songsDict()).forEach(function (s) {
                    tiarab[s.ti + s.ar + s.ab] = s; }); }
            return tiarab; },
        uips: function (subcat) {  //ui persistent state
            var datobj = rtdat.digdat.datobj;
            if(!datobj) {  //digdat not read yet
                jt.log("pdat.uips pre-data call returning temp placeholder");
                datobj = {}; }
            datobj.uips = datobj.uips || {};
            if(subcat) {
                datobj.uips[subcat] = datobj.uips[subcat] || {};
                return datobj.uips[subcat]; }
            return datobj.uips; }
    };  //end mgrs.pdat returned access interface
    }());

return {
    overlaydiv: "appoverlaydiv",
    supnm: semnd.supnm,
    domain: semnd.domain,
    spacebarhookfunc: null,
    docs: mgrs.docs,
    boot: mgrs.boot,
    util: mgrs.util,
    scr: mgrs.scr,
    pdat: mgrs.pdat,
    init: mgrs.boot.loadCodeModules,
    safeAppVersion: function () {
        if(mgrs.pdat.dbObj()) { return mgrs.pdat.songDataVersion(); }
        return app.fileVersion(); },
    fileVersion: function () {
        return "v=250322";  //updated as part of release process
    }
};  //end returned functions
}());
