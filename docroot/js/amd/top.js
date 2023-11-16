/*global app, jt */
/*jslint browser, white, long, unordered */

//Top panel interface and actions
app.top = (function () {
    "use strict";

    const hubdom = "diggerhub.com";
    const suppem = "support@" + hubdom;
    var tddi = "topdlgdiv";  //default to app div used for display
    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("top", mgrfname, args);
    }
    function dotDispatch (dotref, ...args) {
        const mgrfun = dotref.split(".");
        return mgrs[mgrfun[0]][mgrfun[1]].apply(app.top, args); }


    ////////////////////////////////////////////////////////////
    // Local Account actions
    ////////////////////////////////////////////////////////////

    //General hub communication utilities
    mgrs.hcu = (function () {
        //account JSON fields
        var ajfs = {kwdefs:{cmp:["pos", "ig", "dsc"]},
                    igfolds:{}, settings:{}, hubdat:{},
                    musfs:{cmp:["dsId", "email", "firstname", "hashtag"]}};
        var verstat = {};
    return {
        serializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] !== "string") {
                    acct[sf] = JSON.stringify(acct[sf]); } }); },
        deserializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] === "string") {
                    acct[sf] = JSON.parse(acct[sf]); } }); },
        accountAsData: function (acct) {
            mgrs.hcu.serializeAccount(acct);
            const data = jt.objdata(acct);
            mgrs.hcu.deserializeAccount(acct);
            return data; },
        verifyDefaultAccountFields: function (acct) {
            var aci = mgrs.aaa.getAcctsInfo();
            var da = aci.accts.find((a) => a.dsId === "101");
            Object.keys(ajfs).forEach(function (df) {
                acct[df] = acct[df] || da[df] || ""; }); },
        equivField: function (fld, a, b) {  //compare deserialized objs
            if(fld && ajfs[fld] && ajfs[fld].cmp) {
                return ajfs[fld].cmp.every((f) => a[f] === b[f]); }
            return JSON.stringify(a[fld]) === JSON.stringify(b[fld]); },
        accountDisplayDiff: function (a, b) {
            if(!a || !b) { return false; }  //nothing to compare
            const changed = Object.keys(ajfs).find((fld) =>
                !mgrs.hcu.equivField(fld, a, b));
            return changed || false; },
        verifyClientVersion: function () {
            var curracct = mgrs.aaa.getAccount();
            if(curracct.hubVersion && curracct.diggerVersion) {
                verstat.hub = curracct.hubVersion;
                verstat.loc = curracct.diggerVersion;
                if(!verstat.notice && verstat.hub > verstat.loc) {
                    verstat.notice = true;
                    mgrs.gen.togtopdlg("la"); } } },
        getVersionStatus: function () {
            return verstat; }
    };  //end mgrs.hcu returned functions
    }());


    //Song rating data synchronization between local app and DiggerHub
    mgrs.srs = (function () {
        const syt = {tmo:null, stat:"", resched:false, up:0, down:0};
        var upldsongs = null;
        var contexts = {newacct:1800, acctok:1800, unposted:2000, reset:1200,
                        resched:2000, standard:20 * 1000, signin:100};
        function isUpdated (s) {
            return ((s.lp && s.lp > (s.modified || "")) ||  //newly played
                    (s.locmod && s.locmod > (s.modified || ""))); }  //modified
        function notPostedYet (s) {
            return (!s.dsId && s.ti && s.ar &&
                    (!s.fq || !(s.fq.startsWith("D") ||
                                s.fq.startsWith("U")))); }
        function haveUnpostedNewSongs () {
            return Object.values(app.svc.songs())
                .some((s) => notPostedYet(s)); }
        function uploadableSongs () {
            return Object.values(app.svc.songs())
                .filter((s) => isUpdated(s) || notPostedYet(s)); }
    return {
        countSyncOutstanding: function () {
            return uploadableSongs().length; },
        handleSyncError: function (code, errtxt) {
            upldsongs = null;
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.asu.processSignOut(mgrs.aaa.getAccount(), true); }
            else {  //error condition not recovered, stop auto retry
                syt.errcode = code;
                syt.errtxt = errtxt;
                jt.log("syncToHub " + code + ": " + errtxt); } },
        syncToHub: function (context) {
            if(!app.haveHubCredentials()) { return; }
            if(context === "cancel" && syt.tmo) {
                clearTimeout(syt.tmo);
                syt.tmo = null;
                return; }
            mgrs.srs.hubStatInfo("scheduled.");
            if(syt.tmo) {  //already scheduled
                if(syt.stat) {  //currently running
                    syt.resched = true;  //reschedule when finished
                    return; }
                clearTimeout(syt.tmo); }  //not running. reschedule now
            syt.resched = false;
            syt.tmo = setTimeout(mgrs.srs.hubSyncStart,
                                 contexts[context] || contexts.standard); },
        hubSyncStart: function () { //see ../../docs/hubsyncNotes.txt
            if(!app.haveHubCredentials()) {
                jt.out("modindspan", ""); //turn off comms indicator
                mgrs.srs.hubStatInfo("");
                return jt.log("hubSyncStart aborted since not signed in"); }
            syt.stat = "executing";
            mgrs.srs.hubStatInfo("checking...");
            jt.out("modindspan", jt.tac2html(
                ["a", {href:"#hubstatdetails", title:"Show hub work details",
                       onclick:mdfs("gen.togtopdlg", "la", "open")},
                 ["span", {cla:"indicatorlightcolor"},
                  "hub"]]));  //turn on work indicator
            const dat = mgrs.srs.makeSendSyncData();
            mgrs.srs.hubStatInfo("sending...");
            app.svc.dispatch("loc", "hubSyncDat", dat,
                function (updates) {
                    mgrs.srs.hubStatInfo("updating...");
                    mgrs.srs.processReceivedSyncData(updates);
                    mgrs.srs.hubSyncFinished(); },
                function (code, errtxt) {
                    mgrs.srs.handleSyncError(code, errtxt);
                    mgrs.srs.hubSyncFinished(); }); },
        hubSyncFinished: function () {
            syt.pcts = new Date().toISOString();
            syt.stat = "";
            mgrs.srs.hubStatInfo("");
            syt.tmo = null;
            if(syt.errcode) {
                jt.out("modindspan", ""); } //turn off comms indicator
            else if(haveUnpostedNewSongs()) {
                mgrs.srs.syncToHub("unposted"); }
            else if(syt.resched) {
                syt.resched = false;
                mgrs.srs.syncToHub("resched"); }
            else {  //hub sync done
                //This can lead to significant default rating downloads with
                //deck refreshes for every batch call and no explanation or
                //status visible to the user.  Leave for form display.
                //setTimeout(mgrs.fsc.updateContributions, 100);
                jt.out("modindspan", "");  //turn off comms indicator
                mgrs.hcu.verifyClientVersion(); } },
        makeSendSyncData: function () {
            //send the current account + any songs that need sync.  If just
            //signed in, then don't send the current song or anything else
            //until after the initial download sync.  Want to pull down any
            //existing data first to avoid overwriting with unrated.
            var curracct = mgrs.aaa.getAccount();
            upldsongs = [];
            if(!curracct.syncsince) {  //not just signed in
                upldsongs = uploadableSongs();
                upldsongs = upldsongs.slice(0, 199);
                upldsongs = upldsongs.map((sg) => app.txSong(sg)); }
            jt.log("makeSendSyncData uploading " + upldsongs.length + " songs");
            syt.up += upldsongs.length;
            mgrs.hcu.serializeAccount(curracct);
            const obj = {email:curracct.email, token:curracct.token,
                         syncdata:JSON.stringify([curracct, ...upldsongs])};
            mgrs.hcu.deserializeAccount(curracct);
            return jt.objdata(obj); },
        processReceivedSyncData: function (updates) {
            //received account + any songs that need to be saved locally.
            //svc processing has already persisted local data so just need
            //to reflect the updated account and songs in the runtime.
            var changed = mgrs.aaa.reflectAccountChangeInRuntime(updates[0]);
            if(changed) { //need to rebuild display with updated info
                mgrs.aaa.notifyAccountChanged(); }
            const songs = updates.slice(1);
            syt.down += songs.length;
            jt.log("processReceivedSyncData " + songs.length + " songs.");
            songs.forEach(function (s) {
                s = app.svc.dispatch("loc", "noteUpdatedSongData", s);
                app.player.dispatch("mob", "rebuildIfSongPlaying", s); });
            app.deck.dispatch("ws", "rebuildIfChanged",
                              "processReceivedSyncData");
            const curracct = mgrs.aaa.getAccount();
            if(curracct.syncsince && curracct.syncsince < curracct.modified) {
                mgrs.srs.syncToHub(); } },  //more to download...
        makeStatusDisplay: function () {
            var reset = false;
            if(!jt.byId("hubSyncInfoDiv")) { return; }
            jt.out("hubSyncInfoDiv", jt.tac2html(
                [["span", {id:"hsilabspan", cla:"pathlabelgreyspan"},
                  "Hub Sync:"],
                 ["span", {id:"hsitsspan", cla:"infospan"}],
                 ["span", {id:"hsiudspan", cla:"infospan"}],
                 ["span", {id:"hsistatspan", cla:"infospan"}]]));
            if(syt.pcts) {
                const prevt = jt.isoString2Time(syt.pcts).getTime();
                if(syt.err || (Date.now() - prevt) > (60 * 1000)) {
                    reset = true; } }
            mgrs.srs.hubStatInfo(syt.err || "init", reset); },
        hubStatInfo: function (value, reset) {
            if(!jt.byId("hsistatspan")) { return; }
            if(value === "init") {
                if(syt.stat) { value = "processing..."; }
                else if(syt.tmo) { value = "scheduled."; } }
            if(reset) {
                value += " " + jt.tac2html(
                    ["a", {href:"#reset", onclick:mdfs("srs.manualReset"),
                           title:"Restart hub synchronization"},
                     "Reset"]); }
            jt.out("hsistatspan", value);
            if(syt.pcts) {
                jt.out("hsitsspan",
                       jt.isoString2Time(syt.pcts).toLocaleTimeString()); }
            //not all unicode arrows are supported on all browsers.
            jt.out("hsiudspan", "<b>&#8593;</b>" + syt.up +
                   ", <b>&#8595;</b>" + syt.down); },
        manualReset: function () {
            syt.tmo = null;
            syt.stat = "";
            syt.resched = false;
            syt.pcts = "";
            syt.up = 0;
            syt.down = 0;
            mgrs.srs.syncToHub("reset"); }
    };  //end mgrs.srs returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General Account actions
    ////////////////////////////////////////////////////////////

    //Fan messaging actions manager handles collaborative messages
    mgrs.fma = (function () {
        const mstat = {msgs:[], ckd:new Date().toISOString()};
        const mds = {  //message definitions
            recommendation:{  //generated by "Get Recommendations" button
                pn:"Recommendation", desc:"$SONG. $COMMENT",
                actions:"dismiss, thxnrmv, emdet"},
            recresp:{  //sent in response to recommendation
                pn:"Thanks", desc:"For recommending $SONG.",
                actions:"dismiss, welnrmv"},
            recywel:{  //sent in closing response to recresp
                pn:"You're Welcome", desc:"Glad you liked $SONG",
                actions:"dismiss"},
            share:{  //someone in your fan group shared a song with you
                pn:"Share", desc:"$SONG. $COMMENT",
                actions:"dismiss, rspnrmv, dckrem"},
            shresp:{  //sent in response to a share message
                pn:"Great Song!", desc:"$SONG",
                actions:"dismiss"},
            //PENDING: Hub processing for the following message types with
            //at most 1 msg/hr and 3 msg/day.
            discovery:{  //generated after adding a new common song
                pn:"Discovery", desc:"Just added $SONG. $COMMENT",
                actions:"dismiss"},
            pathcross:{  //generated after both played same great song recently
                pn:"Path Cross", desc:"Just listened to $SONG.",
                actions:"dismiss"}};
        const ads = {  //action definitions
            dismiss:{b:"Dismiss", o:"Dismissing", t:"Remove message"},
            thxnrmv:{b:"Thanks&Remove", o:"Sending thank you",
                     t:"Send thank you"},  //generates recresp
            welnrmv:{b:"You're Welcome", o:"Sending you're welcome",
                     t:"Send you're welcome message"}, //generates recywel
            rspnrmv:{b:"Respect&Remove", o:"Sending affirmation",
                     t:"Send song affirmation response"}, //generates shresp
            emdet:{b:"Mail Details", o:"Mailing message details",
                   t:"Email me message details"},
            deck:{b:"Add To Deck", o:"Adding",
                  t:"Put this song on deck to play",
                  clk:"fma.addToDeck"},
            dckrem:{dte:"fma.availNotQueued"}};
        function callFanMessaging (msgaction, paramidcsv, contf, errf) {
            if(!app.haveHubCredentials()) {
                return errf(401,
                            "Sign in to DiggerHub for music fan messaging"); }
            app.svc.dispatch("gen", "fanMessage",
                app.authdata({action:msgaction, idcsv:paramidcsv}),
                contf, errf); }
        function isMatchingSong(s, msg) {
            return (s && msg &&
                    (s.ti === msg.ti || s.smti === msg.smti) &&
                    (s.ar === msg.ar || s.smar === msg.smar)); }
        function findSong (msg) {
            return Object.values(app.svc.songs())
                .find((s) => isMatchingSong(s, msg)); }
        function resetStaleTime () {
            const dms = Date.now() + (60 * 1000);
            mstat.ckd = new Date(dms).toISOString(); }
        function rebuildWorkingMessages (msgs) {
            msgs = msgs || mstat.msgs;
            const musfs = mgrs.aaa.getAccount().musfs;
            msgs.forEach(function (msg) {  //fill sendername
                const mf = musfs.find((mf) => mf.dsId === msg.sndr);
                if(mf) { msg.sendername = mf.digname; } });
            msgs = msgs.filter((m) => m.sendername);  //curr fan grp msgs only
            msgs = msgs.filter((m) => m.status === "open");
            mstat.msgs = msgs; }
        function doneProcNote(dispid, note, ocstr) {
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"donenotediv"},
                 [note, " ",
                  ["a", {href:"#ok", onclick:ocstr}, "Ok"]]])); }
        function isDupeRec(ra, rb) {
            if(!ra || !rb || ra.msgtype !== "recommendation" ||
               rb.msgtype !== "recommencation") {
                return false; }  //not a rec
            if(ra.status === "dismissed" || rb.status !== "dismissed") {
                return false; }  //not a dupe if already dismissed
            if((ra.sndr === rb.sndr) && (ra.songid === rb.songid)) {
                return false; }  //same message, not dupe
            if((ra.ti === rb.ti) && (ra.ar === rb.ar) && (ra.ab === rb.ab)) {
                return true; }
            return false; }
        function dedupeRecommendations (msgstatdiv) {
            //gets rid of one dupe per call.  User can get recs again.
            var dupefound = false;
            mstat.msgs.forEach(function (msg) {
                if(!dupefound && (msg.msgtype === "recommendation" &&
                                  msg.status === "open")) {
                    const dupe = mstat.msgs.find((rec) => isDupeRec(rec, msg));
                    if(dupe) {  //get rid of one dupe, user can get recs again.
                        dupefound = true;
                        mgrs.fma.hubAction("dismiss", msgstatdiv,
                                           dupe.dsId); } } }); }
    return {
        messages: function () { return mstat.msgs; },
        fetchMessagesIfStale: function (contf, errf) {
            if(mstat.ckd < new Date().toISOString()) {
                callFanMessaging("fetch", "",
                    function (msgs) {
                        resetStaleTime();
                        rebuildWorkingMessages(msgs);
                        contf(mstat.msgs); },
                    errf); } },
        redisplayMessages: function (idx) {
            resetStaleTime();
            mgrs.fga.messagesForm(mgrs.aaa.getAccount());
            if(Number.isFinite(idx)) {
                mgrs.fga.togActionsDisplay(idx, "fma.msgOpts"); } },
        getRecs: function (msgstatdiv) {
            const timewindowms = Date.now() - (3 * 24 * 60 * 60 * 1000);
            const thresh = new Date(timewindowms).toISOString();
            const addOrDismissMsg = "You already have recent recommendations.";
            const exrecs = mstat.msgs.filter((m) =>
                (m.msgtype === "recommendation" && m.status === "open" &&
                 m.created >= thresh));
            if(exrecs.length > 4) {
                return jt.out(msgstatdiv, addOrDismissMsg); }
            const mfids = mgrs.aaa.getAccount().musfs
                .filter((mf) => !exrecs.some((r) => r.sndr === mf.dsId))
                .sort(function (a, b) {
                    return b.lastheard.localeCompare(a.lastheard); })
                .map((mf) => mf.dsId)
                .join(",");
            if(!mfids) {
                if(exrecs.length) {
                    return jt.out(msgstatdiv, addOrDismissMsg); }
                return jt.out(msgstatdiv, "No fans to give recommendations."); }
            callFanMessaging("recommend", mfids,
                function (msgs) {
                    if(!msgs || !msgs.length) {
                        return jt.out("msgstatdiv",
                                   "Nobody has any recommendations today."); }
                    rebuildWorkingMessages(msgs.concat(mstat.msgs));
                    mgrs.fma.redisplayMessages();
                    jt.out("msgstatdiv", "Recommendations retrieved.");
                    dedupeRecommendations(msgstatdiv); },
                function (code, errtxt) {
                    jt.out(msgstatdiv, "Recommendations failed " + code +
                           ": " + errtxt); }); },
        msgTxt: function (val, ignore /*fld*/, obj, idx) {
            var txt; var comment = obj.nt || "";
            if(comment.length > 255) {
                comment = jt.tac2html(
                    ["span", {id:"expnt" + idx},
                     ["a", {href:"#expand",
                            onclick:mdfs("fga.expandComment", idx)},
                      jt.ellipsis(comment, 255)]]); }
            const md = mds[val] || {pn:val,
                                    desc:"Unknown message type"};
            txt = jt.tac2html(["span", {cla:"fmtypespan"}, md.pn]) +
                "&nbsp;" + md.desc;
            txt = txt.replace(/\$SONG/g, obj.ti + " by " + obj.ar);
            txt = txt.replace(/\$COMMENT/g, comment);
            return txt; },
        availNotQueued: function (msg) {
            var song = findSong(msg);
            if(song) {  //have song in collection
                const decksongs = app.deck.dispatch("dk", "songs");
                if((!decksongs.length || !isMatchingSong(decksongs[0],msg)) &&
                   !isMatchingSong(app.player.song(), msg)) {
                    return ({name:"deck", def:ads.deck}); } }
            return ({name:"emdet", def:ads.emdet}); },
        addToDeck: function (ignore /*action*/, dispid, msgid) {
            const msgidx = mstat.msgs.findIndex((m) => m.dsId === msgid);
            var msg = mstat.msgs[msgidx];
            var song = findSong(msg);
            app.deck.dispatch("dk", "insertAtTop", song);
            doneProcNote(dispid, "Added on deck",
                         mdfs("fma.redisplayMessages", msgidx)); },
        hubAction: function (actdefname, dispid, msgid) {
            jt.out(dispid, ads[actdefname].o + "...");
            callFanMessaging(actdefname, msgid,
                function (msgs) {
                    const um = msgs[0];
                    const mi = mstat.msgs.findIndex((m) => m.dsId === um.dsId);
                    um.sendername = mstat.msgs[mi].sendername;
                    mstat.msgs[mi] = um;
                    if(actdefname === "dismiss") {
                        mgrs.fma.redisplayMessages(); }
                    else {  //emdet, reply
                        doneProcNote(dispid, msgs[0].procnote,
                                     mdfs("fma.redisplayMessages")); } },
                function (code, errtxt) {
                    jt.out(dispid, ads[actdefname].b + " failed " + code +
                           ": " + errtxt); }); },
        msgOpts: function (dispid, msg) {
            // jt.log("msgOpts msgtype: " + msg.msgtype + ", actions: " +
            //        mds[msg.msgtype].actions);
            const actions = mds[msg.msgtype].actions.csvarray()
                .map((an) => (ads[an].dte? dotDispatch(ads[an].dte, msg) :
                                           ({name:an, def:ads[an]})));
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"msgactionsdiv"},
                 actions.map((a) =>
                     ["button", {type:"button", title:a.def.t,
                                 onclick:mdfs((a.def.clk || "fma.hubAction"),
                                              a.name, dispid, msg.dsId)},
                      a.def.b])])); }
    };  //end mgrs.fma returned functions
    }());


    //Fan status calculation manager handles multi-stage server calcs
    mgrs.fsc = (function () {
        const fas = [  //fan actions
            {a:"deleteFan", n:"Delete", d:"Delete $FAN from your group"},
            {a:"getDefaultRatings", n:"Ratings", m:5,
             d:"Fill default song ratings from $FAN"},
            {a:"recomputeFanCounts", n:"Recount", m:20,
             d:"Recompute collection common/received/sent"}];
        var mfps = {}; //music fan processing status
        var matchFormViewed = "";
        var collabInProgress = false;
        function isFresh(tsact, tsview) {
            if(!tsact) {  //action never taken, so data not up to date
                return false; }
            if(!tsview) {  //data has not been observed, so compute not needed
                return true; }
            tsact = jt.isoString2Time(tsact).getTime();
            tsview = jt.isoString2Time(tsview).getTime();
            if(tsview - tsact < 24 * 60 * 60 * 1000) {
                return true; }  //data has been fetched within staleness range
            return false; }  //data needs to be refreshed
        function noteFan (mf, dispid) {
            mfps[mf.dsId] = mfps[mf.dsId] || {};
            mfps[mf.dsId].fan = mf;  //always update with latest given instance
            if(dispid) {  //note current status display div if given
                mfps[mf.dsId].dispid = dispid; } }
        function callHubFanCollab (mfanid, collabtype, contf, errf) {
            if(!app.haveHubCredentials()) {
                return errf(401, "Sign in to DiggerHub to collaborate with other music fans"); }
            app.svc.dispatch("gen", "fanCollab",
                app.authdata({mfid:mfanid, ctype:collabtype}),
                function (hubres) {
                    mgrs.aaa.reflectAccountChangeInRuntime(hubres[0]);
                    hubres.slice(1).forEach(function (s) {
                        app.svc.dispatch("gen", "noteUpdatedSongData", s); });
                    if(hubres.slice(1).length) {
                        app.deck.update("fancollab"); }
                    const acct = mgrs.aaa.getAccount();
                    noteFan(acct.musfs.find((mf) => mf.dsId === mfanid));
                    mgrs.fga.reflectUpdatedAccount(acct);
                    contf(); },
                function (code, errtxt) {
                    //PENDING: if API throttling error, setTimeout and retry
                    errf(code, errtxt); }); }
    return {
        doneNote: function (dispid, msg) {
            if(!msg) { return jt.out(dispid, ""); }
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"donenotediv"},
                 [msg, " ",
                  ["a", {href:"#dismiss",
                         onclick:mdfs("fsc.doneNote", dispid)},
                   "Ok"]]])); },
        deleteFan: function (mfid) {
            const fan = mfps[mfid].fan;
            const digname = fan.digname;
            var confmsg = "Are you sure you want to delete " + digname + "?";
            if(fan.dfltrcv) {
                confmsg = "Clear " + fan.dfltrcv + " received default " +
                    "ratings and delete " + digname + "?"; }
            jt.out("fanactionsdiv", jt.tac2html(
                [confmsg,
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"fandelnob",
                               onclick:mdfs("fsc.fanActionsDisplay")},
                    "No"],
                   ["button", {type:"button", id:"fandelyesb",
                               onclick:mdfs("fsc.clearAndRemove", mfid)},
                    "Yes"]]]])); },
        clearAndRemove: function (mfid) {
            const mp = mfps[mfid];
            if(mp.fan.dfltrcv) {  //still more default ratings to get rid of
                mp.statHTML = "Clearing " + mp.fan.dfltrcv +
                    " default ratings from " + mp.fan.digname + "...";
                jt.out(mp.dispid, mp.statHTML);
                callHubFanCollab(mfid, "clear",
                    function () {
                        mgrs.fsc.clearAndRemove(mfid); },
                    function (code, errtxt) {
                        mp.statHTML = "";
                        jt.out(mp.dispid, "Clearing default ratings failed " +
                               code + ": " + errtxt); }); }
            else { //default ratings cleared, remove fan from group
                const digname = mp.fan.digname;
                mp.statHTML = "Removing " + digname + " from group...";
                jt.out(mp.dispid, mp.statHTML);
                mp.statHTML = "";  //clear stat in case adding back later
                mgrs.fga.removeFanFromGroup(digname, mfps[mfid].dispid); } },
        getDefaultRatings: function (mfid, contf) {
            const mp = mfps[mfid];
            const digname = mp.fan.digname;
            const prevdrc = mp.fan.dfltrcv;
            mp.statHTML = "Getting default ratings from " + digname + "...";
            jt.out(mp.dispid, mp.statHTML);
            callHubFanCollab(mfid, "get",
                function () {
                    mgrs.fga.redisplay();  //show progress
                    if(mp.fan.dfltrcv !== prevdrc) {  //received new defaults
                        mgrs.fsc.doneNote(mp.dispid,
                                          "Checking more default ratings...");
                        mgrs.fsc.getDefaultRatings(mfid, contf); }  //check more
                    else {  //no more default ratings received
                        mgrs.fsc.doneNote(mp.dispid,
                                          "Default ratings fetched for " +
                                          digname);
                        if(mp.fan.common < mp.fan.dfltrcv) {
                            mgrs.fsc.recomputeFanCounts(mfid); }
                        if(contf) { contf(mfid); } } },
                function (code, errtxt) {
                    mp.statHTML = "";
                    jt.out(mp.dispid, "Getting default ratings failed " +
                           code + ": " + errtxt); }); },
        recomputeFanCounts: function (mfid, contf) {
            const mp = mfps[mfid];
            const digname = mp.fan.digname;
            mp.statHTML = "Counting common ratings with " + digname + "...";
            jt.out(mp.dispid, mp.statHTML);
            callHubFanCollab(mfid, "count",
                function () {
                    mgrs.fga.redisplay();
                    mgrs.fsc.doneNote(mp.dispid, "Common ratings with " +
                                      digname + " recounted.");
                    if(contf) { contf(mfid); } },
                function (code, errtxt) {
                    mp.statHTML = "";
                    jt.out(mp.dispid, "Common rating count failed " +
                           code + ": " + errtxt); }); },
        fanActionsDisplay: function (dispid, fan) {
            noteFan(fan, dispid);
            if(mfps[fan.dsId].status) {   //currently processing
                return jt.out(dispid, mfps[fan.dsId].statHTML); }
            jt.out(dispid, jt.tac2html(
                ["div", {id:"fanactionsdiv"}, fas.map((act) =>
                    ["button", {type:"button",
                                title:act.d.replace(/\$FAN/g, fan.digname),
                                onclick:mdfs("fsc." + act.a, fan.dsId)},
                     act.n])])); },
        noteMatchFormViewed: function () {  //match display viewed
            matchFormViewed = new Date().toISOString(); },
        updateContributions: function (acct) {  //recalc common and dflt rcv
            if(collabInProgress) {
                return; }  //finish processing outstanding hub call
            acct = acct || mgrs.aaa.getAccount();
            acct.musfs = acct.musfs || [];
            acct.musfs.forEach(function (mf) {
                noteFan(mf); });  //update mfps with latest fan info
            const comchkmf = acct.musfs.find((mf) =>
                !isFresh(mf.lastcommon, matchFormViewed));
            if(comchkmf) {  //need to recompute common ratings
                collabInProgress = true;
                mgrs.fsc.recomputeFanCounts(comchkmf.dsId, function () {
                    //change sort to common desc to indicate values have changed
                    if(mgrs.fga.formType() === "match") {
                        mgrs.fga.sort("common", "desc"); }
                    collabInProgress = false;
                    mgrs.fsc.updateContributions(); }); }
            else {  //all common calcs up to date
                const rcvchkmf = acct.musfs.find((mf) =>
                    !isFresh(mf.lastpull, matchFormViewed));
                if(rcvchkmf) {
                    collabInProgress = true;
                    mgrs.fsc.getDefaultRatings(rcvchkmf.dsId, function () {
                        collabInProgress = false;
                        mgrs.fsc.updateContributions(); }); } } }
    };  //end mgrs.fsc returned functions
    }());


    //Fan group actions manager handles connecting with other fans
    mgrs.fga = (function () {
        //messages and musfs can be sorted without persisting
        var fni = null;  //current display working info
        const srch = {id:"mfsrchin", value:""};
        const forms = {
            connect:{af:"musfs", flds:[
                {n:"digname", c:"fsc.fanActionsDisplay"},
                {n:"firstname", p:"name"},
                {n:"added", o:"desc", f:"ts"},
                {n:"lastheard", p:"last heard", o:"desc", f:"ts"}]},
            match:{af:"musfs", flds:[
                {n:"digname", c:"fsc.fanActionsDisplay"},
                {n:"common", o:"desc", p:"common", f:"int"},
                {n:"dfltrcv", o:"desc", p:"rcv", f:"int"},
                {n:"dfltsnd", o:"desc", p:"snd", f:"int"}]},
            messages:{af:"digmsgs", flds:[
                {n:"created", o:"desc", p:"when", f:"ts"},
                {n:"sendername", p:"who"},
                {n:"msgtype", p:"what", d:"fma.msgTxt", c:"fma.msgOpts"}]}};
        function sortCurrentObjects () {
            fni.objs.sort(function (a, b) {
                var res = 0; var sfi = 0; var sfd = null;
                while(!res && sfi < forms[fni.formtype].sofs.length) {
                    sfd = forms[fni.formtype].sofs[sfi];
                    if(sfd.f === "int") {
                        res = a[sfd.n] - b[sfd.n]; }
                    else {
                        res = a[sfd.n].localeCompare(b[sfd.n]); }
                    if(sfd.o === "desc") { res *= -1; }
                    sfi += 1; }
                return res; }); }
        function setCurrentFieldsAndInstances (form, curracct) {
            const fd = forms[form];  //form definition
            if(!fd.sofs) {  //init form sort order fields ref array
                fd.sofs = fd.flds.map((fld) => fld); }
            fni = {formtype:form, flds:forms[form].flds, acct:curracct,
                   objs:curracct[fd.af] || []};
            if(fd.af === "digmsgs") {
                fni.objs = mgrs.fma.messages()
                    .filter((m) => m.status === "open"); }
            else {  //skip any old/bad fan defs
                fni.objs = fni.objs.filter((mf) => !mf.email); }
            sortCurrentObjects(); }
        function headerFieldsHTML () {
            const downarrow = "&#x25BC;";
            const uparrow = "&#x25B2;";
            const html = jt.tac2html(["tr", fni.flds.map((fld) =>
                ["td", 
                 ["div", {cla:"fgasortcoldiv"},
                  ["div", {cla:(fld.f === "int" ? "fgacelldivnum"
                                                : "fgacelldiv")},
                   ["a", {href:"#sortby", onclick:mdfs("fga.sort", fld.n)},
                    (fld.o === "desc"? downarrow : uparrow) +
                    (fld.p || fld.n)]]]])]);
            return html; }
        function contentCellHTML (fld, obj, idx) {
            var val = obj[fld.n];
            var dispclass = "fgacelldiv";
            if(fld.f === "ts") {
                val = jt.colloquialDate(val, true, "z2loc nodaily").slice(4); }
            if(fld.f === "int") {  //display as string so zero values show up
                dispclass = "fgacelldivnum";
                val = String(val) + "&nbsp;"; }
            if(fld.d) {  //use display function for value
                val = dotDispatch(fld.d, val, fld, obj, idx); }
            if(fld.c) {  //clickable value 
                val = ["a", {href:"#" + fld.c,
                             onclick:mdfs("fga.togActionsDisplay", idx, fld.c)},
                       val]; }
            return ["div", {cla:dispclass}, val]; }
        function contentRowsHTML (extras) {
            var rows = [];
            if(extras.before) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgabeforehtmldiv"},
                             extras.before]]])); }
            if(extras.empty && !fni.objs.length) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgaemptyhtmldiv"},
                             extras.empty]]])); }
            rows = rows.concat(fni.objs.map((obj, idx) =>
                jt.tac2html(
                    [["tr", fni.flds.map((fld) =>
                        ["td", contentCellHTML(fld, obj, idx)])],
                     ["tr", ["td", {id:"detrowtd" + idx,
                                    colspan:fni.flds.length}]]])));
            if(extras.after) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgaafterhtmldiv"},
                             extras.after]]])); }
            return jt.tac2html(rows); }
        function formDisplayHTML (extras) {
            return jt.tac2html(
                [["div", {id:"fgadispdiv"},
                  ["table",
                   [headerFieldsHTML(),
                    contentRowsHTML(extras)]]],
                 ["div", {id:"fgaoverlaydiv",
                          onclick:mdfs("fga.displayOverlay")}]]); }
        function modifyFanGroup (fanact, fandig, contf, errf) {
            if(!app.haveHubCredentials()) {
                return errf(401, "Sign in to DiggerHub to change your fans"); }
            app.svc.dispatch("gen", "fanGroupAction",
                app.authdata({action:fanact, digname:fandig}),
                function (results) {
                    mgrs.aaa.updateCurrAcct(results[0], null,
                        function (acct) {
                            fni.acct = acct;
                            contf(acct); },
                        errf); },
                errf); }
        function noteUpdatedAccountAndRedisplay (acct, contrib) {
            mgrs.aaa.updateCurrAcct(acct, null,
                function () {
                    fni.acct = acct;
                    fni.objs = acct.musfs;
                    mgrs.fga[fni.formtype + "Form"](acct);  //update display
                    if(contrib) {
                        mgrs.fsc.updateContributions(acct); } },
                function (code, errtxt) {
                    jt.err("The hub account updated but app save failed " +
                           code + ": " + errtxt + 
                           ". You should probably reload the app."); }); }
        function recsButtonTAC (acct) {
            var tac = "";
            if(acct && acct.musfs && acct.musfs.length) {
                tac = ["button", {type:"button", id:"getrecsb",
                                  onclick:mdfs("fma.getRecs", "msgstatdiv")},
                       "Get Recommendations"]; }
            return tac; }
    return {
        reflectUpdatedAccount: function (acct) {
            if(fni) {  //form currently displayed and processing
                fni.acct = acct;
                if(fni.formtype !== "messages") {
                    fni.objs = acct.musfs;
                    sortCurrentObjects(); } } },
        redisplay: function () {
            if(fni) {  //form currently displayed
                mgrs.fga[fni.formtype + "Form"](fni.acct); } },
        sort: function (fieldname, direction) {
            var sofs = forms[fni.formtype].sofs;
            if(sofs[0].n === fieldname) {  //already first
                if(direction) {
                    sofs[0].o = direction; }
                else {  //change direction
                    if(sofs[0].o === "desc") {
                        sofs[0].o = "asc"; }
                    else {
                        sofs[0].o = "desc"; } } }
            else {  //move field to first position in search ordering
                const sf = sofs.find((sf) => sf.n === fieldname);
                sofs = sofs.filter((sf) => sf.n !== fieldname);
                sofs.unshift(sf);
                forms[fni.formtype].sofs = sofs; }
            //sortCurrentObjects();  called in redisplay processing
            mgrs.fga.redisplay(); },
        search: function (srchid) {
            var val = jt.byId(srchid).value;
            if(srch.status === "searching") { return; }  //ignore extra click
            if(!val) {
                return jt.out("mfsrchstatdiv",
                              "Need fan's digname for search"); }
            srch.status = "searching";
            jt.out("mfsrchstatdiv", "Searching...");
            modifyFanGroup("add", val,
                function (acct) {
                    srch.status = "";
                    noteUpdatedAccountAndRedisplay(acct, "contrib"); },
                function (code, errtxt) {
                    srch.status = "";
                    jt.out("mfsrchstatdiv", code + ": " + errtxt); }); },
        connectme: function () {
            jt.out("mfsrchstatdiv", "Connecting you...");
            modifyFanGroup("add", "",
                function (acct) {  //acct has new musfs with all counts zero
                    fni.formtype = "match";  //display collab process
                    noteUpdatedAccountAndRedisplay(acct, "contrib"); },
                function (code, errtxt) {
                    jt.out("mfsrchstatdiv", code + ": " + errtxt); }); },
        removeFanFromGroup: function (digname, dispid) {
            modifyFanGroup("remove", digname,
                function (acct) {
                    noteUpdatedAccountAndRedisplay(acct); },
                function (code, errtxt) {
                    jt.out(dispid || "mfsrchstatdiv", "Remove failed " +
                           code + ": " + errtxt); }); },
        togActionsDisplay: function (idx, fscfn) {
            var dtd = jt.byId("detrowtd" + idx);
            if(dtd.innerHTML) {  //currently displayed, toggle off
                dtd.innerHTML = "";
                return; }
            dotDispatch(fscfn, "detrowtd" + idx, fni.objs[idx]); },
        displayOverlay: function () {
            const ovd = jt.byId("fgaoverlaydiv");
            if(!ovd) { return; }
            const tosync = mgrs.srs.countSyncOutstanding();
            const dd = jt.byId("fgadispdiv");
            if(tosync > 100) {  //block interaction while data load completes
                dd.style.opacity = 0.3;
                ovd.innerHTML = "Uploading " + tosync +
                    " songs before collaborating...";
                ovd.style.height = dd.offsetHeight + "px";
                setTimeout(mgrs.fga.displayOverlay, 5000);
                return true; }
            dd.style.opacity = 1.0;
            ovd.innerHTML = "";
            ovd.style.height = "0px";
            return false; },
        connectForm: function (acct) {
            setCurrentFieldsAndInstances("connect", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                after:jt.tac2html(
                    ["div", {id:"mfsrchdiv"},
                     [["Find music fan &nbsp;",
                       ["input", {type:"text", id:srch.id, size:14,
                                  placeholder:"digname...",
                                  value:srch.value,
                                  onchange:mdfs("fga.search", srch.id)}],
                       ["a", {href:"#search", title:"Search Fans",
                              onclick:mdfs("fga.search", srch.id)},
                        ["img", {src:"img/search.png", cla:"ico20"}]]],
                      ["div", {id:"mfsrchstatdiv"}]]]),
                empty:jt.tac2html(
                    ["button", {type:"button", id:"connectmeb",
                                onclick:mdfs("fga.connectme", "connectmeb")},
                     "Connect Me"])}));
            mgrs.fga.displayOverlay(); },
        matchForm: function (acct) {
            mgrs.fsc.noteMatchFormViewed();
            setCurrentFieldsAndInstances("match", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                empty:"No music fans in your group"}));
            if(!mgrs.fga.displayOverlay()) {
                mgrs.fsc.updateContributions(acct); } },
        messagesForm: function (acct) {
            setCurrentFieldsAndInstances("messages", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                empty:"No messages",
                after:jt.tac2html(
                    ["div", {id:"msgstatdiv"}, recsButtonTAC(acct)])}));
            mgrs.fma.fetchMessagesIfStale(
                function () { mgrs.fga.messagesForm(acct); },
                function (code, errtxt) {
                    jt.out("msgstatdiv", "Message fetch failed " + code + ": " +
                           errtxt + ". Try again in a few minutes"); });
            mgrs.fga.displayOverlay(); },
        formType: function () {
            if(!fni) {
                return ""; }
            return fni.formtype || ""; }
    };  //end mgrs.fga returned functions
    }());


    //Account sign in and update manager handles the standard account forms.
    //Notes:
    //  - Forgot password sends an email with a link back to diggerhub.
    //    They change their password on the hub and then sign in with the app.
    //  - Changing an email address for an account requires prompting for a
    //    password to create a new phash for an access token.
    mgrs.asu = (function () {
        var curracct = null;  //temp local copy refreshed on each form display
        var emsent = "";
        const affs = [  //modes: 'j'oin|'s'ignin|'p'rofile|pass'w'ordchg
            {n:"email", dn:"email", m:"pwd", ty:"readonly"},
            {n:"email", dn:"email", m:"js", ty:"email"},
            {n:"password", dn:"password", m:"js", ty:"password"},
            {n:"updemail", dn:"new email", m:"w", ty:"email"},
            {n:"updpassword", dn:"new password", m:"w", ty:"password"},
            {n:"firstname", dn:"first name", m:"jp", ty:"text"},
            {n:"digname", dn:"dig name", m:"jp", ty:"text", plc:"optional"},
            {n:"privaccept", m:"jp", ty:"checkbox"}];
        function makeLabel (labname) {
            switch(labname) {
            case "privaccept":
                return app.subPlaceholders(
                    app.overlaydiv, app.svc.urlOpenSupp(),
                    "I'm ok with the PRIVPOLICY");
            default: return "Unknown label type: " + labname; } }
        function makeInput (acct, aff) {
            var val = "";
            if(acct && acct[aff.n]) { val = acct[aff.n]; }
            if(jt.byId(aff.n + "in")) { val = jt.byId(aff.n + "in").value; }
            return ["input", {type:(aff.ty || "text"), id:aff.n + "in",
                              value:val, placeholder:(aff.plc || "")}]; }
        function formTableRow (acct, aff) {
            switch(aff.ty) {
            case "checkbox": return jt.tac2html(
                ["tr",
                 ["td", {colspan:2},
                  [["input", {type:"checkbox", id:aff.n + "in",
                              value:new Date().toISOString()}],
                   ["label", {fo:aff.n + "in", id:aff.n + "label"},
                    makeLabel(aff.n)]]]]);
            case "readonly": return jt.tac2html(
                ["tr",
                 [["td", {cla:"formattr"}, (aff.dn || aff.n)],
                  ["td", ["span", {cla:"formvalspan"}, acct[aff.n]]]]]);
            default: return jt.tac2html(
                ["tr",
                 [["td", {cla:"formattr"}, (aff.dn || aff.n)],
                  ["td", makeInput(acct, aff)]]]); } }
        function contextuallyObviated (aff) {
            return (aff.n === "privaccept" && mgrs.ppc.policyAccepted()); }
        function clientCancelButton () {
            var ret = "";
            if(mgrs.afg.inApp()) {
                ret = ["button", {type:"button", id:"cancelb",
                                  onclick:mdfs("gen.togtopdlg", null, "close")},
                       "Cancel"]; }
            return ret; }
        function accountFieldsForm (acct, mode, buttons, extra) {
            curracct = acct;  //update form processing account context
            extra = extra || "";
            jt.out("afgcontdiv", jt.tac2html(
                [["table",
                  affs.filter((aff) => (aff.m.includes(mode) &&
                                        !contextuallyObviated(aff)))
                  .map((aff) => formTableRow(acct, aff))],
                 ["div", {id:"afgstatdiv"}],
                 ["div", {cla:"dlgbuttonsdiv", id:"afgbtsdiv"}, buttons],
                 ["div", {id:"afgextradiv"}, extra]])); }
        function formData (mode, dat) {
            dat = dat || {};
            affs.filter((aff) => (aff.m.includes(mode) &&
                                  !contextuallyObviated(aff)))
                .forEach(function (aff) {
                    var input = jt.byId(aff.n + "in");
                    if(input) {
                        if(aff.ty === "checkbox") {
                            dat[aff.n] = (input.checked? input.value : ""); }
                        else {
                            dat[aff.n] = input.value.trim(); } } });
            return dat; }
        function addAuthDataFields (dat) {
            if(curracct) {
                dat.an = curracct.email;
                dat.at = curracct.token; } }
        function formError (dat, ecfs) {
            ecfs = ecfs || [];
            const ef = ecfs.find((ecf) => ecf(dat));
            if(ef) {
                const err = ef(dat);
                jt.out("afgstatdiv", err.msg);
                if(err.fld) {
                    const input = jt.byId(err.fld + "in");
                    if(input) {
                        input.focus(); } } }
            return ef; }
        function verifyEmail (dat) {
            if(!jt.isProbablyEmail(dat.email)) {
                return {msg:"Need email address.", fld:"email"}; } }
        function verifyPwd (dat) {
            if(!dat.password) {  //let server enforce length and other reqs
                return {msg:"Need password.", fld:"password"}; } }
        function verifyPriv (dat) {
            if(!dat.privaccept && !contextuallyObviated({n:"privaccept"})) {
                return {msg:"Is the privacy policy acceptable?"}; } }
        function verifyFirst (dat) {
            const fnml = 32;
            if(!dat.firstname) {
                return {msg:"Need a name to call you by.", fld:"firstname"}; }
            if(dat.firstname.length > fnml) {
                return {msg:"Max " + fnml + " letters.", fld:"firstname"}; } }
        function verifyDN (dat) {
            const dnml = 20;
            if(!dat.digname) {
                return {msg:"Need a Digger music fan name.", fld:"digname"}; }
            if(dat.digname.length > dnml) {
                return {msg:"Max " + dnml + " letters.", fld:"digname"}; } }
        function verifyCred (dat) {
            if(!jt.isProbablyEmail(dat.updemail)) {
                return {msg:"Need email address.", fld:"updemail"}; }
            if(!dat.updpassword) {  //let server enforce length and other reqs
                return {msg:"Need password.", fld:"updpassword"}; } }
        function verifyKwdefs (dat) {
            if(!dat.kwdefs || dat.kwdefs === "{}") {
                dat.kwdefs = JSON.stringify(
                    mgrs.aaa.getDefaultKeywordDefinitions()); } }
        function makeHubCall (buttonid, verb, endpoint, dat, contf) {
            jt.byId(buttonid).disabled = true;
            jt.out("afgstatdiv", "Calling DiggerHub...");
            const data = jt.objdata(dat);
            const errf = function (code, errtxt) {
                jt.byId(buttonid).disabled = false;
                jt.out("afgstatdiv", code + ": " + errtxt); };
            app.svc.dispatch("gen", "makeHubAcctCall", verb, endpoint, data,
                function (atk) {
                    jt.out("afgstatdiv", "Saving...");
                    if(endpoint === "acctok") { //reset syncsince on new signin
                        atk[0].syncsince = atk[0].created + ";1"; }
                    if(endpoint.startsWith("mailpwr")) {
                        return contf(); }  //no account to update
                    mgrs.aaa.updateCurrAcct(atk[0], atk[1],
                        function (acct) {
                            jt.out("afgstatdiv", "Saved.");
                            if(app.svc.plat("hdm") === "loc") {
                                mgrs.srs.syncToHub(endpoint); }
                            contf(acct); },
                        errf); },
                errf); }
    return {
        newacctForm: function (acct) {
            accountFieldsForm(acct, "j",
                [clientCancelButton(),
                 ["button", {type:"button", id:"newacctb",
                            onclick:mdfs("asu.newacctProc", "newacctb")},
                 "Create Account"]]); },
        newacctProc: function (buttonid) {
            const dat = formData("j");
            if(!formError(dat, [verifyEmail, verifyPwd, verifyFirst, verifyDN,
                                verifyPriv, verifyKwdefs])) {
                makeHubCall(buttonid, "POST", "newacct", dat, function (acct) {
                    if(mgrs.afg.inApp()) {
                        mgrs.gen.updateHubToggleSpan(acct);
                        mgrs.gen.togtopdlg(null, "close"); }
                    else {  //standalone account management
                        mgrs.afg.accountFanGroup("personal"); } }); } },
        signinForm: function (acct) {
            accountFieldsForm(acct, "s",
                [clientCancelButton(),
                 ["button", {type:"button", id:"signinb",
                             onclick:mdfs("asu.signinProc", "signinb")},
                  "Sign In"]],
                ["a", {href:"#pwdreset", title:"Send password reset email",
                       onclick:mdfs("asu.emailPwdReset")},
                 "Send password reset"]);
            if(!mgrs.afg.inApp()) {  //allow enter key signin on website
                jt.on("passwordin", "change", function (evt) {
                    mgrs.asu.signinProc("signinb");
                    jt.evtend(evt); }); } },
        signinProc: function (buttonid) {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail, verifyPwd])) {
                makeHubCall(buttonid, "POST", "acctok", dat, function (acct) {
                    if(mgrs.afg.inApp()) {  //running within web app
                        mgrs.gen.updateHubToggleSpan(acct);  //UI reflect name
                        mgrs.gen.togtopdlg(null, "close");
                        mgrs.igf.resetIgnoreFolders(acct.igfolds);
                        mgrs.igf.markIgnoreSongs();
                        mgrs.aaa.notifyAccountChanged();  //UI reflect settings
                        //acct.syncsince already reset in makeHubCall
                        mgrs.srs.syncToHub("signin"); }
                    else { //standalone account management
                        app.login.dispatch("ap", "save", acct);
                        mgrs.afg.accountFanGroup("groups", 2); } }); } },
        emailPwdReset: function () {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail])) {
                const url = app.cb("mailpwr", dat);
                makeHubCall("signinb", "GET", url, null, function () {
                    var msg = "Email sent.";
                    if(emsent) { msg += " Check spam folder."; }
                    emsent = new Date().toISOString();
                    jt.out("afgstatdiv", msg); }); } },
        settingsForm: function (statmsg) {
            const acct = mgrs.aaa.getAccount();
            const stgs = acct.settings || {};
            const sact = stgs.sumact || {sendon:"Wednesday"};
            const dsow = ["Monday", "Tuesday", "Wednesday", "Thursday",
                          "Friday", "Saturday", "Sunday"];
            jt.out("afgcontdiv", jt.tac2html(
                [["div", {cla:"settingsrowdiv"},
                  [["input", {type:"checkbox", id:"wkactin", value:"active",
                              checked:jt.toru(sact.sendon !== "Never")}],
                   ["select", {id:"wkactdaysel", title:"Weekly report day"},
                    dsow.map((d) =>
                        ["option", {value:d,
                                    selected:jt.toru(d === sact.sendon)},
                         d])]]],
                 ["div", {id:"afgstatdiv"}, statmsg || ""],
                 ["div", {cla:"dlgbuttonsdiv", id:"afgbtsdiv"},
                  [["button", {type:"button", id:"cancelb",
                               onclick:mdfs("asu.profileForm")},
                    "Cancel"],
                   ["button", {type:"button", id:"saveb",
                               onclick:mdfs("asu.settingsProc")},
                    "Save"]]]]));
            if(statmsg) {
                jt.out("afgbtsdiv", jt.tac2html(
                    ["button", {type:"button", id:"cancelb",
                                onclick:mdfs("asu.profileForm")},
                     "Done"])); } },
        settingsProc: function () {
            var dow = "Wednesday";
            const cb = jt.byId("wkactin");
            if(cb && !cb.checked) {
                dow = "Never"; }
            else {  //use selected day
                const sel = jt.byId("wkactdaysel");
                dow = sel.value; }
            const acct = mgrs.aaa.getAccount();
            acct.settings.sumact = acct.settings.sumact || {};
            acct.settings.sumact.sendon = dow;
            jt.out("afgstatdiv", "Saving...");
            jt.byId("afgbtsdiv").style.display = "none";
            mgrs.aaa.updateCurrAcct(
                acct, acct.token,
                function () {
                    mgrs.asu.settingsForm("Saved."); },
                function (code, errtxt) {
                    jt.out("afgstatdiv", "Save failed " + code + ": " + errtxt);
                    jt.byId("afgbtsdiv").style.display = "block"; }); },
        profileForm: function (acct) {
            acct = acct || mgrs.aaa.getAccount();
            accountFieldsForm(
                acct, "p",
                [["div", {id:"formfunctogdiv"},
                  ["a", {href:"#settings",
                         onclick:mdfs("asu.settingsForm")},
                   "Settings"]],
                 ["button", {type:"button", id:"updateb",
                             onclick:mdfs("asu.profileProc", "updateb")},
                  "Update"]]); },
        profileProc: function (buttonid) {
            const dat = formData("p");
            addAuthDataFields(dat);
            if(app.startParams.actcode) {
                dat.actcode = app.startParams.actcode; }
            if(!formError(dat, [verifyFirst, verifyDN, verifyPriv])) {
                makeHubCall(buttonid, "POST", "updacc", dat, function (acct) {
                    if(mgrs.afg.inApp() && dat.privaccept) {  //checkbox done
                        mgrs.gen.togtopdlg(null, "close"); }
                    mgrs.gen.updateHubToggleSpan(acct);  //UI reflect name
                    jt.out("afgbtsdiv", "");
                    jt.out("afgstatdiv", "Profile updated."); }); } },
        credentialsForm: function (acct) {
            accountFieldsForm(acct, "w",
                ["button", {type:"button", id:"updcredb",
                            onclick:mdfs("asu.credentialsProc", "updcredb")},
                 "Update"]);
            jt.byId("updemailin").value = acct.email; },
        credentialsProc: function (buttonid) {
            const dat = formData("w");
            addAuthDataFields(dat);  //auth when resetting password
            if(!formError(dat, [verifyCred])) {
                makeHubCall(buttonid, "POST", "updacc", dat, function () {
                    jt.out("afgbtsdiv", "");
                    jt.out("afgstatdiv", "Credentials updated."); }); } },
        signoutForm: function (acct) {
            acct = acct || mgrs.aaa.getAccount();
            accountFieldsForm(
                acct, "d",
                [["button", {type:"button", id:"deletemeb",
                             onclick:mdfs("asu.confirmDeleteMe")},
                  "Delete Me"],
                 ["button", {type:"button", id:"signoutb",
                             onclick:mdfs("asu.confirmSignOut")},
                  "Sign Out"]],
                ["div", {id:"dmsoConfirmDiv"}]); },
        confirmDeleteMe: function () {
            jt.out("dmsoConfirmDiv", jt.tac2html(
                [["Are you sure you want to irrevocably and completely delete your account, song ratings, and all information you have saved on DiggerHub?"],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"dmconfnob",
                               onclick:mdfs("asu.signoutForm")}, "No"],
                   ["button", {type:"button", id:"dmconfyesb",
                               onclick:mdfs("asu.processDeleteMe")},
                    "Yes"]]]])); },
        processDeleteMe: function () {
            var acct = mgrs.aaa.getAccount();
            const dat = jt.objdata({an:acct.email, at:acct.token,
                                    tzoff:new Date().getTimezoneOffset()});
            jt.out("dmsoConfirmDiv", "Sending deletion confirmation...");
            app.svc.dispatch("gen", "makeHubAcctCall", "POST", "deleteme", dat,
                function () {
                    jt.out("dmsoConfirmDiv", "Account deletion confirmation instructions have been sent to " + acct.email + ". Follow the instructions in the email and respond to verify you are the account owner."); },
                function (code, errtxt) {
                    jt.out("Deletion failed, please contact support, " + code +
                           ": " + errtxt); }); },
        confirmSignOut: function () {
            jt.out("dmsoConfirmDiv", jt.tac2html(
                [["You will need to resync all your songs when you sign in again. Continue signing out?"],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"soconfnob",
                               onclick:mdfs("asu.signoutForm")}, "No"],
                   ["button", {type:"button", id:"soconfyesb",
                               onclick:mdfs("asu.processSignOut")},
                    "Yes"]]]])); },
        processSignOut: function () {
            if(app.svc.plat("hdm") === "loc") {
                mgrs.srs.syncToHub("cancel"); }
            else { //"web"
                app.login.dispatch("hua", "signOut"); }
            mgrs.aaa.removeAccount(mgrs.aaa.getAccount(),
                function () {
                    if(mgrs.afg.inApp()) {
                        mgrs.gen.updateHubToggleSpan(mgrs.aaa.getAccount());
                        mgrs.aaa.notifyAccountChanged(); }
                    mgrs.afg.accountFanGroup("offline"); },
                function (code, errtxt) {
                    jt.out("afgstatdiv", code + ": " + errtxt); }); }
    };  //end mgrs.asu returned functions
    }());


    //Account and fan group manager handles personal and connection forms.
    mgrs.afg = (function () {
        var inapp = true;
        var mode = "offline";
        const tabs = {
            offline: [
                {h:"join", t:"join", oc:"asu.newacctForm"},
                {h:"signin", t:"sign in", oc:"asu.signinForm"}],
            personal: [
                {h:"profile", t:"profile", oc:"asu.profileForm"},
                {h:"password", t:"password", oc:"asu.credentialsForm"},
                {h:"signout", t:"sign out", oc:"asu.signoutForm"},
                {h:"fans", t:"fans", oc:"afg.groups"}],
            groups: [
                {h:"connect", t:"connect", oc:"fga.connectForm"},
                {h:"match", t:"match", oc:"fga.matchForm"},
                {h:"messages", t:"messages", oc:"fga.messagesForm"},
                {h:"me", t:"me", oc:"afg.personal"}]};
        function haveProfileIssue (acct) {
            return (acct && !acct.digname); }
        function getProfileAccount () {
            var acct = mgrs.aaa.getAccount();
            if(acct && acct.dsId === "101") {
                acct = null; }
            if(acct && !inapp) {
                //no confirmation of signout when on web.
                tabs.personal[2].oc = "asu.processSignOut"; }
            return acct; }
        function verifyModeAndIndex (acct, dispmode, midx) {
            midx = midx || 0;
            if(dispmode) {
                mode = dispmode; }
            else { //use default display
                if(!acct) {
                    mode = "offline"; }
                else {
                    mode = "groups";
                    const msgs = mgrs.fma.messages();
                    if(msgs && msgs.length) {
                        midx = 2; } } }
            if(haveProfileIssue(acct)) {
                mode = "personal";
                midx = 0; }
            return midx; }
    return {
        setDisplayDiv: function (divid) {  //called by hub site
            tddi = divid; },
        inApp: function () { return inapp; },
        setInApp: function (runningInApp) { inapp = runningInApp; },
        accountFanGroup: function (dispmode, midx) {
            const acct = getProfileAccount();
            midx = verifyModeAndIndex(acct, dispmode, midx);
            if(!jt.byId("afgcontdiv") || mode !== "offline") {  //keep emailin
                jt.out(tddi, jt.tac2html(
                    ["div", {id:"afgdiv"},
                     [["div", {id:"afgtopdiv"}],
                      ["div", {id:"afgcontdiv"}]]])); }
            jt.out("afgtopdiv", jt.tac2html(
                tabs[mode].map((tab, ti) => jt.tac2html(
                    ["a", {href:"#" + tab.h,
                           onclick:mdfs("afg.accountFanGroup", mode, ti)},
                     ["span", {cla:((midx === ti)? "fhselspan" : "fhspan")},
                      tab.t]]))
                    .join(" &nbsp;|&nbsp ")));
            const [mgr, fun] = tabs[mode][midx].oc.split(".");
            if(haveProfileIssue(acct)) {
                mgrs.asu.profileForm(acct); }
            else if(mgr === "afg") {
                mgrs.afg.accountFanGroup(fun); }
            else {
                mgrs[mgr][fun](acct); } }
    };  //end mgrs.afg returned functions
    }());


    //App account access manager serves as central ref for account and config
    //Update DigAcc on hub first, then reflect in local/runtime config.
    mgrs.aaa = (function () {
        const dfltkeywords = {
            Social: {pos: 1, sc: 0, ig: 0, dsc: "Music I might select to play when other people are listening."},
            Personal: {pos: 2, sc: 0, ig: 0, dsc: "Music I might select to play when it's just me listening."},
            Office: {pos: 3, sc: 0, ig: 0, dsc: "Music that you can listen to while you work."},
            Dance: {pos: 4, sc: 0, ig: 0, dsc: "Music you would dance to."},
            Ambient: {pos: 0, sc: 0, ig: 0, dsc: "Music that can be listened to from zero to full attention, transitioning from and to silence."},
            Jazz: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Classical: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Talk: {pos: 0, sc: 0, ig: 0, dsc: "Spoken word."},
            Solstice: {pos: 0, sc: 0, ig: 0, dsc: "Holiday seasonal."}};
        var dfltigfolds = [];  //Noisy folders that are typically not songs
        var cfg = null;  //runtime config object
        var curracct = null;
        function resetCurrentAccountRef () {
            curracct = cfg.acctsinfo.accts.find((x) =>
                x.dsId === cfg.acctsinfo.currid);
            mgrs.hcu.deserializeAccount(curracct);
            jt.log("aaa.resetCurrentAccountRef " + curracct.dsId +
                   " settings: " + JSON.stringify(curracct.settings)); }
    return {
        getAccount: function () { return curracct; },
        getConfig: function () { return cfg; },
        getAcctsInfo: function () { return cfg.acctsinfo; },
        getDefaultKeywordDefinitions: function () { return dfltkeywords; },
        setConfig: function (config) {
            cfg = config;
            dfltigfolds = cfg.dfltigfolds || dfltigfolds;
            mgrs.aaa.reflectDarkMode();
            mgrs.aaa.verifyConfig(); },
        verifyConfig: function () {
            cfg = cfg || {};
            if(!cfg.acctsinfo) {
                jt.log("aaa.verifyConfig recreating cfg.acctsinfo");
                cfg.acctsinfo = {currid:"", accts:[]};
                if(!cfg.acctsinfo.accts.find((x) => x.dsId === "101")) {
                    jt.log("aaa.verifyConfig making default account");
                    const diggerbday = "2019-10-11T00:00:00Z";
                    cfg.acctsinfo.accts.push(
                        {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                         created:diggerbday, modified:diggerbday + ";1",
                         email:suppem, token:"none", kwdefs:dfltkeywords,
                         igfolds:dfltigfolds}); } }
            if(!cfg.acctsinfo.currid) {
                jt.log("aaa.verifyConfig defaulting cfg.acctsinfo.currid");
                cfg.acctsinfo.currid = "101"; }
            jt.log("aaa.verifyConfig cfg.acctsinfo.currid: " +
                   cfg.acctsinfo.currid);
            resetCurrentAccountRef(); },
        reflectAccountChangeInRuntime: function (acct, token) {
            mgrs.hcu.deserializeAccount(acct);  //verify deserialized
            const changed = mgrs.hcu.accountDisplayDiff(curracct, acct);
            token = token || curracct.token;
            mgrs.aaa.verifyConfig();  //make sure guest account available
            mgrs.hcu.verifyDefaultAccountFields(acct);  //fill fields as needed
            acct.token = token;
            curracct = acct;
            cfg.acctsinfo.currid = acct.dsId;
            cfg.acctsinfo.accts = [acct,
                ...cfg.acctsinfo.accts.filter((a) => a.dsId !== acct.dsId)];
            return changed; },
        updateCurrAcct: function (acct, token, contf, errf) {
            mgrs.hcu.deserializeAccount(acct);  //verify deserialized
            mgrs.aaa.reflectAccountChangeInRuntime(acct, token);
            app.svc.writeConfig(cfg,
                function (writtenconf) {
                    cfg = writtenconf;
                    resetCurrentAccountRef();
                    mgrs.hcu.verifyClientVersion();
                    contf(curracct); },
                errf); },
        removeAccount: function (acct, contf, errf) {
            cfg.acctsinfo.accts = cfg.acctsinfo.accts.filter((a) =>
                a.dsId !== acct.dsId);
            cfg.acctsinfo.currid = "101";
            app.svc.writeConfig(cfg,
                function (writtenconf) {
                    cfg = writtenconf;
                    resetCurrentAccountRef();
                    contf(curracct); },
                errf); },
        notifyAccountChanged: function (context) {
            if(!context || context === "keywords") {
                mgrs.kwd.rebuildKeywords();
                app.player.dispatch("kwd", "rebuildToggles");
                app.filter.dispatch("kft", "rebuildControls"); }
            if(!context || context === "igfolders") {
                mgrs.igf.redrawIgnoreFolders(); }
            if(!context || context === "settings") {
                app.filter.dispatch("stg", "rebuildAllControls", true); } },
        getDarkMode: function () {  //returns either "dark" or "light"
            return cfg.darkmode || "light"; },
        reflectDarkMode: function (mode) {
            mode = mode || mgrs.aaa.getDarkMode();
            if(mode === "dark") {
                jt.byId("darkmodecss").disabled = false; }
            else {
                jt.byId("darkmodecss").disabled = true; } },
        toggleDarkMode: function (mode) {
            if(!mode) {
                mode = mgrs.aaa.getDarkMode();
                if(mode === "light") {
                    mode = "dark"; }
                else {
                    mode = "light"; } }
            cfg.darkmode = mode;
            app.svc.writeConfig(cfg,
                function (writtenconf) {
                    cfg = writtenconf;
                    mgrs.aaa.reflectDarkMode(cfg.darkmode); },
                function (code, errtxt) {
                    jt.log("toggleDarkMode writeConfig call failure " + code +
                           ": " + errtxt); }); }
    };  //end mgrs.aaa returned functions
    }());


    //Privacy policy change manager handles checking things are up to date
    mgrs.ppc = (function () {
        var callsToCheck = 0;
        var pts = "";  //policy timestamp
    return {
        policyAccepted: function () {
            const acct = mgrs.aaa.getAccount();
            if(acct) {
                if(acct.hubdat) {
                    if(acct.hubdat.privaccept > pts) {
                        return true; }
                    jt.log("top.ppc.policyAccepted " +
                           acct.hubdat.privaccept + " <= " + pts); }
                else {
                    jt.log("top.ppc.policyAccepted no acct.hubdat"); } }
            return false; },
        checkPrivacyPolicyTimestamp: function () {
            jt.log("checkPrivacyPolicyTimestamp callsToCheck " + callsToCheck);
            const acct = mgrs.aaa.getAccount();
            if(!acct || acct.dsId === "101" || pts) {
                return; }  //not signed in, or already checked
            callsToCheck += 1;
            app.svc.docContent("docs/privacy.html", function (body) {
                var idx = body.indexOf("span id=\"privlut\"");
                if(idx < 0) {
                    return jt.log("no timestamp marker in privacy.html"); }
                body = body.slice(idx);
                body = body.slice(body.indexOf(">") + 1);
                pts = body.slice(0, body.indexOf("<"));
                if(!mgrs.ppc.policyAccepted()) {
                    jt.err("The DiggerHub privacy policy has been updated.");
                    //open the profile tab with the priv policy checkbox
                    mgrs.afg.accountFanGroup("personal", 0); } }); }
    };  //end mgrs.ppc returned functions
    }());


    ////////////////////////////////////////////////////////////
    // Library actions
    ////////////////////////////////////////////////////////////

    //Config manager handles path changes requiring an app restart.
    mgrs.cfg = (function () {
        var cdat = null;
    return {
        restart: function () {
            cdat = null;
            app.restart(); },
        updateConfig: function () {
            cdat.musicPath = jt.byId("mlibin").value;
            cdat.dbPath = jt.byId("dbfin").value;
            app.svc.dispatch("loc", "changeConfig", cdat,
                function () { mgrs.cfg.restart(); },
                function (code, errtxt) {
                    jt.out("configstatdiv", "Config update failed " +
                           code + ": " + errtxt); }); },
        launch: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            cdat = {musicPath:config.musicPath, dbPath:config.dbPath};
            jt.out("contentdiv", jt.tac2html(
                ["div", {cla:"paneldiv"},
                 [["div", {id:"titlediv"},
                   ["span", {cla:"titlespan"}, "Digger Config"]],
                  ["div", {id:"ciheadingdiv"},
                   ["Changes will be saved to ",
                    ["span", {cla:"filenamespan"}, ".digger_config.json"],
                    " in your home folder."]],
                  //Local file names are not accessible via JS.  A folder
                  //selected via webkitdirectory sends all the contained
                  //files which is prohibitive for a large music library.
                  //Putting digdat.json in your music library folder faces
                  //similar issues.
                  ["div", {cla:"configitemdiv"},
                   [["div", {cla:"cidescdiv"},
                     "Find my music library at:"],
                    ["input", {type:"text", id:"mlibin", size:40,
                               value:cdat.musicPath}]]],
                  ["div", {cla:"configitemdiv"},
                   [["div", {cla:"cidescdiv"},
                     "Move my song rating database to:"],
                    ["input", {type:"text", id:"dbfin", size:40,
                               value:cdat.dbPath}]]],
                  ["div", {id:"configstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", id:"cicancelb",
                                title:"Restart without changing config",
                                onclick:mdfs("cfg.restart")},
                    "Cancel"],
                    ["button", {type:"button", id:"cichangeb",
                                title:"Restart with config changes",
                                onclick:mdfs("cfg.updateConfig")},
                    "Update"]]]]])); },
        confirmStart: function () {
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {cla:"confirmdiv"},
                 ["Restart Digger into config change mode?",
                  ["div", {cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", title:"Cancel mode change",
                                onclick:mdfs("gen.togtopdlg", "la")},
                     "Nevermind"],
                    ["button", {type:"button", title:"Restart in config mode",
                                onclick:mdfs("cfg.launch")},
                     "Ok"]]]]])); }
    };  //end of mgrs.cfg returned functions
    }());


    //Ignore Folders manager handles folders to be ignored on scan/play.
    mgrs.igf = (function () {
        var igfolds = null;
        var activeFolderName = "";
        function getAccountIgnoreFolders () {
            var aifs = mgrs.aaa.getAccount().igfolds || [];
            if(!Array.isArray(aifs)) { aifs = []; }
            return aifs; }
    return {
        igMusicFolders: function () {
            jt.out(tddi, jt.tac2html(
                ["div", {id:"igfouterdiv"},
                 [["div", {id:"igfdiv"}],
                  ["div", {id:"igfindiv"}],
                  ["div", {id:"igfstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"igfbdiv"},
                   ["button", {type:"button", id:"igfaddb",
                               onclick:mdfs("igf.addIgnoreFolder")},
                    "Add"]]]]));
            mgrs.igf.redrawIgnoreFolders(); },
        redrawIgnoreFolders: function () {
            igfolds = getAccountIgnoreFolders();
            if(!jt.byId("igfdiv")) {  //not currently displaying
                return; }
            jt.out("igfdiv", jt.tac2html(
                ["table", {id:"igftable"},
                 igfolds.map((fname, idx) =>
                     ["tr", {cla:"igftr", id:"igftr" + idx},
                      [["td", fname],
                       ["td", ["a", {href:"#Remove", title:"Remove " + fname,
                                     onclick:mdfs("igf.removeIgnoreFolder",
                                                  fname)},
                               ["img", {cla:"rowbuttonimg",
                                        src:"img/trash.png"}]]]]])]));
            if(activeFolderName) {
                const tr = jt.byId("igftr" + igfolds.indexOf(activeFolderName));
                if(tr) {
                    tr.scrollIntoView();
                    window.scrollTo(0, 0); }
                activeFolderName = ""; }
            const config = app.svc.dispatch("loc", "getConfig");
            jt.out("igfindiv", jt.tac2html(
                [["label", {fo:"igfin"},
                  "Ignore " + config.musicPath + "/**/"],
                 ["input", {type:"text", id:"igfin", size:30}]]));
            jt.out("igfstatdiv", ""); },
        updateIgnoreFolders: function () {
            var acct = mgrs.aaa.getAccount();
            acct.igfolds = igfolds;
            jt.out("igfstatdiv", "Updating ignore folders...");
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                function () {
                    jt.out("igfstatdiv", "");
                    mgrs.igf.unmarkIgnoreSongs();
                    mgrs.igf.markIgnoreSongs();
                    mgrs.aaa.notifyAccountChanged("igfolders"); },
                function (code, errtxt) {
                    jt.out("kwupdstatdiv", String(code) + ": " + errtxt); }); },
        removeIgnoreFolder: function (foldername) {
            igfolds = igfolds.filter((fn) => fn !== foldername);
            mgrs.igf.updateIgnoreFolders(); },
        addIgnoreFolder: function () {
            var afn = jt.byId("igfin").value || "";
            afn = afn.trim();
            if(!afn) {
                return mgrs.igf.redrawIgnoreFolders(); }
            activeFolderName = afn;
            if(igfolds.indexOf(afn) < 0) {  //doesn't already exist
                igfolds.push(afn);
                igfolds.sort(); }
            mgrs.igf.updateIgnoreFolders(); },
        unmarkIgnoreSongs: function () {
            Object.values(app.svc.songs()).forEach(function (s) {
                if(s.fq.startsWith("I")) {
                    s.fq = s.fq.slice(1); } }); },
        markIgnoreSongs: function () {
            igfolds = igfolds || getAccountIgnoreFolders();
            Object.entries(app.svc.songs()).forEach(function ([p, s]) {
                if((!s.fq || !s.fq.match(/^[DU]/)) && mgrs.igf.isIgPath(p)) {
                    //jt.log("Ignoring " + s.ti);  //can be a lot of output..
                    s.fq = "I" + s.fq; } }); },
        isIgPath: function (p) {
            var pes = p.split("/");
            if(pes.length <= 1) {  //top level file, or windows
                pes = p.split("\\"); }
            if(pes.length > 1) {
                return igfolds.some((f) =>
                    (pes[pes.length - 2] === f ||
                     (f.endsWith("*") &&
                      pes[pes.length  - 2].startsWith(f)))); }
            return false; },
        resetIgnoreFolders: function (folderNamesArray) {
            igfolds = folderNamesArray; }
    };  //end of mgrs.igf returned functions
    }());


    //Keyword manager handles keywords in use for the library.
    mgrs.kwd = (function () {
        var kwdefs = null;  //curracct kwdefs
        var uka = null;  //update keywords array (UI form data)
        var vizuka = null;  //ignored keywords filtered out
    return {
        countSongKeywords: function () {
            Object.values(kwdefs).forEach(function (kd) { kd.sc = 0; });
            Object.values(app.svc.songs()).forEach(function (song) {
                song.kws = song.kws || "";
                song.kws.csvarray().forEach(function (kw) {
                    if(!kwdefs[kw]) {
                        kwdefs[kw] = {pos:0, sc:0, ig:0}; }
                    kwdefs[kw].sc += 1; }); }); },
        verifyKeywordDefinitions: function () {
            if(!kwdefs || Object.keys(kwdefs).length < 4) {
                kwdefs = JSON.parse(JSON.stringify(
                    mgrs.aaa.getDefaultKeywordDefinitions())); } },
        rebuildKeywords: function () {
            kwdefs = mgrs.aaa.getAccount().kwdefs;
            mgrs.kwd.verifyKeywordDefinitions();
            mgrs.kwd.countSongKeywords(); },
        defsArray: function (actfirst) {
            mgrs.kwd.verifyKeywordDefinitions();
            const kds = Object.entries(kwdefs).map(function ([k, d]) {
                return {pos:d.pos, sc:d.sc, ig:d.ig, kw:k, dsc:d.dsc}; });
            const aks = kds.filter((kd) => !kd.ig);
            aks.sort(function (a, b) {
                if(actfirst) {
                    if(a.pos && b.pos) { return a.pos - b.pos; }
                    if(a.pos && !b.pos) { return -1; }
                    if(!a.pos && b.pos) { return 1; } }
                return a.kw.localeCompare(b.kw); });
            return aks; },
        makePosSel: function (kw, pos) {
            var pivs = ["-", "1", "2", "3", "4"];  //position indicator values
            var ofs = 0;
            if(vizuka.length <= 4) {
                pivs = pivs.slice(1);
                ofs = 1; }
            return jt.tac2html(
                ["select", {id:"posel" + kw, title:"UI position of " + kw,
                            onchange:mdfs("kwd.posChange", kw)},
                 pivs.map((opt, i) => 
                     ["option", {value:i + ofs, 
                                 selected:jt.toru(pos === i + ofs)},
                      opt])]); },
        posChange: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            var upv = Number(jt.byId("posel" + kw).value);
            var pkd = uka.find((kd) => kd.pos === upv);
            pkd.pos = ukd.pos;
            ukd.pos = upv;
            mgrs.kwd.redrawUpdateForm(); },
        makeTrash: function (kw, pos) {
            var html = ["img", {cla:"rowbuttonimg", src:"img/trashdis.png"}];
            if(!pos) {  //not currently selected as a display keyword
                html = ["a", {href:"#Ignore_" + kw,
                              onclick:mdfs("kwd.trashKeyword", kw)},
                        ["img", {cla:"rowbuttonimg", src:"img/trash.png"}]]; }
            return jt.tac2html(html); },
        trashKeyword: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            ukd.ig = 1;
            mgrs.kwd.redrawUpdateForm(); },
        togKwdDesc: function (kw) {
            var kdd = jt.byId(kw + "descrdiv");
            if(kdd) {
                if(kdd.style.display === "none") {
                    kdd.style.display = "block"; }
                else {
                    kdd.style.display = "none"; } } },
        redrawUpdateForm: function () {
            vizuka = uka.filter((kd) => !kd.ig);
            jt.out("kwupdtablediv", jt.tac2html(
                ["table", {id:"kwdseltable"},
                 vizuka.map((kwd) =>
                     [["tr", {cla:"kwdtr"},
                       [["td", mgrs.kwd.makePosSel(kwd.kw, kwd.pos)],
                        ["td", ["a", {href:"#Describe" + kwd.kw,
                                      onclick:mdfs("kwd.togKwdDesc", kwd.kw)},
                                kwd.kw]],
                        ["td", kwd.sc],
                        ["td", mgrs.kwd.makeTrash(kwd.kw, kwd.pos)]]],
                      ["tr", {cla:"kwdesctr"},
                       [["td"],
                        ["td", {colspan:3},
                         ["div", {id:kwd.kw + "descrdiv", cla:"kddescrdiv",
                                  style:"display:none", contentEditable:true},
                          kwd.dsc || ""]]]]])])); },
        chooseKeywords: function () {
            mgrs.kwd.countSongKeywords();  //recount in case keyword was toggled
            uka = mgrs.kwd.defsArray();
            jt.out(tddi, jt.tac2html(
                ["div", {id:"kwupdiv"},
                 [["div", {id:"kwupdtablediv"}],
                  ["div", {id:"kwupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"kwdefbdiv"},
                   ["button", {type:"button", id:"kwdefupdb",
                               onclick:mdfs("kwd.saveKeywordDefs")},
                    "Update"]]]]));
            mgrs.kwd.redrawUpdateForm(); },
        keywordDefsError: function () {
            //UI should not allow creating an invalid kwdefs state. Verify.
            var errmsg = "";
            if(uka.length < 4) {
                errmsg = "Four keywords required."; }
            const ords = [{n:"first", v:1}, {n:"second", v:2}, {n:"third", v:3},
                          {n:"fourth", v:4}];
            ords.reverse().forEach(function (ord) {
                if(!uka.find((kwd) => kwd.pos === ord.v)) {
                    errmsg = "Missing " + ord.n + " keyword."; } });
            if(errmsg) {
                jt.out("kwupdstatdiv", errmsg);
                jt.byId("kwdefupdb").disabled = false; }
            return errmsg; },
        saveKeywordDefs: function () {
            //either showing the full keywords form, or swapping a kwtog ctrl
            if(jt.byId("kwdefupdb")) {  //called from local form
                jt.byId("kwdefupdb").disabled = true;  //debounce button
                jt.out("kwupdstatdiv", "Saving..."); }
            if(mgrs.kwd.keywordDefsError()) { return; }
            const acct = mgrs.aaa.getAccount();
            uka.forEach(function (kd) {  //update kwdefs directly
                var def = {pos:kd.pos, sc:kd.sc, ig:kd.ig, dsc:kd.dsc || ""};
                var descr = jt.byId(kd.kw + "descrdiv");
                if(descr) {
                    descr = descr.innerText || "";
                    def.dsc = descr.trim(); }
                acct.kwdefs[kd.kw] = def; });
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                function () {
                    mgrs.gen.togtopdlg("", "close");
                    mgrs.aaa.notifyAccountChanged("keywords"); },
                function (code, errtxt) {
                    jt.out("kwupdstatdiv", String(code) + ": " + errtxt); }); },
        same: function (kwa, kwb) {  //localeCompare base not yet on mobile
            return kwa.toLowerCase() === kwb.toLowerCase(); },
        addKeyword: function (kwd) {  //called from player
            var kd;
            uka = uka || mgrs.kwd.defsArray();
            kd = uka.find((kd) => mgrs.kwd.same(kd.kw, kwd));
            if(kd) {  //already exists and not previously deleted, bump count
                kd.sc += 1; }
            else {  //not in current working set
                kd = kwdefs[kwd];
                if(kd) {  //previously existed, add adjusted copy
                    kd = {kw:kwd, pos:0, sc:kd.sc + 1, ig:0}; }
                else {  //brand new keyword
                    kd = {kw:kwd, pos:0, sc:1, ig:0}; }
                uka.push(kd); }
            mgrs.gen.togtopdlg("", "close");  //in case open
            mgrs.kwd.saveKeywordDefs(); },
        swapFilterKeyword: function (kwd, pos) {  //called from filter
            uka = uka || mgrs.kwd.defsArray();
            const prevkd = uka.find((kd) => kd.pos === pos);
            prevkd.pos = 0;
            const currkd = uka.find((kd) => kd.kw === kwd);
            currkd.pos = pos;
            mgrs.gen.togtopdlg("", "close");  //in case open
            mgrs.kwd.saveKeywordDefs("swapFilterKeyword"); }
    };  //end of mgrs.kwd returned functions
    }());


    //Local library actions manager handles lib level actions and data.
    mgrs.locla = (function () {
        var acts;
        var slfrc = "";  //session library file import check
    return {
        initialize: function () {
            acts = [
                {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
                 tt:"Configure music and data file locations", 
                 p:"musicPath", n:"Music Files"},
                {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
                 tt:"Configure music and data file locations",
                 p:"dbPath", n:"Digger Data"},
                {ty:"info", htmlfs:"versionInfoHTML"},
                {ty:"info", htmlfs:"getLatestVersionHTML"},
                {ty:"info", htmlfs:"hubSyncInfoHTML"},
                {ty:"btn", oc:app.dfs("svc", "loc.loadLibrary"),
                 tt:"Read all files in the music folder",
                 n:"Read Files", id:"readfilesbutton"},
                {ty:"btn", oc:mdfs("igf.igMusicFolders"),
                 tt:"Ignore folders when reading music files",
                 n:"Ignore Folders", id:"ignorefldrsbutton"},
                {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
                 tt:"Choose keywords to use for filtering",
                 n:"Choose Keywords", id:"choosekwdsbutton"},
                {ty:"btn", oc:mdfs("aaa.toggleDarkMode"),
                 tt:"Toggle dark mode display",
                 n:"Dark", id:"darkmodebutton"}];
            acts = acts.filter((a) => app.svc.topLibActionSupported(a)); },
        writeDlgContent: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => (a.ty === "cfgp" &&
                                      app.svc.plat(a.p) === "editable"))
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["a", {href:"#configure", onclick:a.oc, title:a.tt},
                         ["span", {cla:"pathlabelspan"}, a.n + ": "]],
                        ["span", {cla:"pathspan", id:"cfgp" + a.p + "span"}, 
                         config[a.p]]]])],
                 ["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "info")
                  .map((a) =>
                      ["div", {cla:"pathdiv"}, mgrs.locla[a.htmlfs]()])],
                 ["div", {cla:"dlgbuttonsdiv"},
                  acts.filter((a) => a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", title:a.tt, onclick:a.oc},
                       a.n])]]));
            setTimeout(mgrs.locla.missingMetadataLink, 50); },
        missingMetadataSongs: function () {
            return Object.values(app.svc.dispatch("loc", "songs"))
                .filter((s) => ((!s.fq || !s.fq.startsWith("D")) &&
                                s.ar === "Unknown" && s.ab === "Singles")); },
        missingMetadataLink: function () {
            var mmdcount = mgrs.locla.missingMetadataSongs().length;
            //on fixed music config platforms, this info is less useful
            if(!mmdcount || !jt.byId("cfgpmusicPathspan")) { return ""; }
            jt.out("cfgpmusicPathspan", jt.tac2html(
                [jt.byId("cfgpmusicPathspan").innerHTML,
                 " &nbsp; ",
                 ["a", {href:"#missingmetadata", title:"Songs Missing Metadata",
                        onclick:mdfs("locla.displayMMSongs")},
                  "-" + mmdcount + "md"]])); },
        displayMMSongs: function () {
            jt.out(tddi, jt.tac2html(
                ["div", {id:"bmdsongsdiv"},
                 mgrs.locla.missingMetadataSongs().map((s) =>
                     ["div", {cla:"bmdsonglinkdiv"},
                      ["a", {href:"#play" + s.dsId, title:"Play Song" + s.dsId,
                             onclick:mdfs("locla.playSong", s.path)},
                       s.path]])])); },
        playSong: function (path) {
            var song = app.svc.dispatch("loc", "songs")[path];
            app.deck.dispatch("dk", "removeFromDeck", song.path);
            app.deck.dispatch("hst", "noteSongPlayed", song);
            app.deck.dispatch("dk", "playnow", "hst", 0); },
        versionInfoHTML: function () {
            var vstr = mgrs.gen.songDataVersion();
            if(!vstr) {  //e.g. stubbed demo data
                vstr = app.svc.plat("versioncode") || "vx.x.x"; }
            const versioncode = app.svc.plat("versioncode");  //build number
            if(versioncode) {
                vstr += ", " + versioncode; }
            vstr += ", " + app.fileVersion();
            return jt.tac2html(
                [["span", {cla:"pathlabelgreyspan"}, "Version:"],
                 ["span", {cla:"infospan"}, vstr]]); },
        getLatestVersionHTML: function () {
            const verstat = mgrs.hcu.getVersionStatus();
            if(!verstat.notice) { return ""; }
            return jt.tac2html(
                [["span", {cla:"pathlabelgreyspan"}, "Update:"],
                 ["span", {cla:"infospan"},
                  verstat.hub + " is available on DiggerHub"]]); },
        hubSyncInfoHTML: function () {
            if(!app.haveHubCredentials()) { return ""; }
            setTimeout(mgrs.srs.makeStatusDisplay, 100);
            return jt.tac2html(["div", {id:"hubSyncInfoDiv"}]); },
        libimpNeeded: function () {
            if(slfrc) { return; }
            slfrc = new Date().toISOString();
            setTimeout(function () {
                app.svc.dispatch("loc", "loadLibrary", "toponelinestatdiv"); },
                       200); },
        noteLibraryLoaded: function () {
            slfrc = new Date().toISOString(); }
    };  //end mgrs.locla returned functions
    }());


    //Web library actions manager handles lib level actions and data for
    //streaming platforms.  Currently this is just Spotify, where liking an
    //album is separate from liking a track.  In both cases likes are ordered
    //by time, so it is sufficient to check from the last known offset.
    //developer.spotify.com/documentation/web-api/reference/#category-library
    mgrs.webla = (function () {
        var acts;  //library actions
        var spip = {  //spotify import processing
            mode:"done",        //"scheduled", "albums", "tracks"
            sto: null,          //scheduling timeout
            maxconnretries:3};  //player connection wait count
        function getSpi () {
            var spi = app.login.getAuth().settings.spimport;
            if(!spi || (spi.lastcheck > "2020" &&
                        spi.lastcheck < "2021-07-10")) {  //server version check
                spi = {lastcheck:"",
                       offsets:{albums:0, tracks:0},
                       imported:0, existing:0}; }
            return spi; }
        function impstat (txt) {
            jt.log("impstat: " + txt);
            if(jt.byId("nomusicstatdiv")) {  //alternate status display area
                const stat = getSpi();
                jt.out("nomusicstatdiv", jt.tac2html(
                    ["Spotify library lookup ",
                     ["span", {id:"spalbcountspan"}, stat.offsets.albums],
                     " Albums, ",
                     ["span", {id:"sptrkcountspan"}, stat.offsets.tracks],
                     " Tracks, ",
                     txt])); }
            else {  //replace button with import message, or log if unavailable.
                jt.out("spimpbspan", txt); } }
        function recentlyChecked (stat) {
            return (stat && stat.lastcheck &&
                    jt.timewithin(stat.lastcheck, "days", 1)); }
    return {
        initialize: function () {
            acts = [  
                {ty:"stat", lab:"Spotify song count", id:"spscval",
                 valfname:"songCount"},
                {ty:"stat", lab:"Spotify library", id:"splibval",
                 valfname:"splibStat"},
                {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
                 tt:"Choose keywords to use for filtering",
                 n:"Choose Keywords"}]; },
        songCount: function () {
            var scs = app.login.getAuth().settings.songcounts;
            if(!scs || scs.posschg > scs.fetched) {
                app.svc.dispatch("web", "getSongTotals",
                    function () {
                        jt.out("spscval", mgrs.webla.songCount()); },
                    function (code, errtxt) {
                        jt.out("spscval", code + ": " + errtxt); });
                return "Calculating..."; }
            if(scs.hubdb === 0) {
                return "No songs yet"; }
            return scs.spotify + "/" + scs.hubdb + " (" +
                (Math.round((scs.spotify / scs.hubdb) * 100)) + "%)"; },
        handleSpotifyLibraryData: function (obj) {
            if(!obj.items.length) {  //no more items returned from query
                if(spip.mode === "albums") {
                    spip.mode = "tracks";
                    return mgrs.webla.spimpProcess(); }
                else {  //Done with import, note completed
                    const acct = mgrs.aaa.getAccount();
                    getSpi().lastcheck = new Date().toISOString();
                    return mgrs.aaa.updateCurrAcct(acct, acct.token,
                        function () {
                            impstat("checked just now");
                            spip.mode = "done"; },
                        function (code, errtxt) {
                            impstat("spimp note " + code + ": " + errtxt);
                            spip.mode = "done"; }); } }
            impstat("merging...");
            app.svc.dispatch("web", "spotifyImport", spip.mode, obj.items,
                function (results) {
                    var stat = getSpi();
                    jt.out("spalbcountspan", stat.offsets.albums);
                    jt.out("sptrkcountspan", stat.offsets.tracks);
                    const songs = results.slice(1);
                    app.deck.dispatch("ws", "noteUpdatedSongs", songs);
                    app.svc.dispatch("web", "addSongsToPool", songs);
                    app.deck.dispatch("ws", "rebuildIfLow", "spimport");
                    mgrs.webla.spimpProcess(); },
                function (code, errtxt) {
                    spip.mode = "done";
                    impstat("merge failed " + code + ": " + errtxt); }); },
        spimpProcess: function () {
            var stat = getSpi();
            if(spip.mode === "done") {  //already checked recently
                return impstat("done."); }
            if(spip.mode === "scheduled") { spip.mode = "albums"; }
            impstat("checking " + spip.mode + "...");
            const spurl = `me/${spip.mode}?offset=${stat.offsets[spip.mode]}`;
            app.svc.dispatch("spc", "sjc", spurl, "GET", null,
                function (obj) {
                    mgrs.webla.handleSpotifyLibraryData(obj); },
                function (code, msg) {
                    spip.mode = "done";
                    impstat("fetch failed " + code + ": " + msg); }); },
        scheduleImportProcess: function (context) {
            if(spip.sto) {
                return impstat("scheduled..."); }
            spip.sto = setTimeout(function () {
                spip.sto = null;
                const spconn = app.player.dispatch("spa", "getPlayerStatus");
                if(spconn === "connected") {
                    if(context === "playstart") {  //yield to player startup
                        spip.mode = "done";
                        return mgrs.webla.spimpNeeded(); } }
                else { //not connected, try waiting
                    spip.mode = "done";
                    impstat("Waiting for connection..." +
                            (spip.maxconnretries || ""));
                    if(spip.maxconnretries > 0) {
                        spip.maxconnretries -= 1;
                        return mgrs.webla.spimpNeeded(); } }
                //Try import. Player may never be ready if no songs.
                impstat("importing...");
                if(!spip.mode || spip.mode === "done") {
                    spip.mode = "scheduled"; }
                mgrs.webla.spimpProcess(); }, 2000); },
        spimpNeeded: function (context) {
            var stat = getSpi(); context = context || "";
            jt.log("spimpNeeded " + context + " " + JSON.stringify(stat));
            if(spip.mode && spip.mode !== "done") {
                impstat("processing " + spip.mode + "...");
                return; }
            impstat("fetching...");  //replace button if displayed
            if(context === "useraction" || !recentlyChecked(stat)) {
                mgrs.webla.scheduleImportProcess(context); }
            else {  //clear interim status, nothing to do.
                impstat("checked Today"); } },
        splibStat: function () {
            var stat = getSpi();
            return jt.tac2html(
                [["span", {id:"spalbcountspan"}, String(stat.offsets.albums)],
                 " Albums, ",
                 ["span", {id:"sptrkcountspan"}, String(stat.offsets.tracks)],
                 " Tracks, ",
                 ["span", {id:"spimpbspan"},
                  //if they open the library display, and checking is ongoing
                  //then this link will be replaced on the next status update.
                  ["a", {onclick:mdfs("webla.spimpNeeded", "useraction"),
                         title:"Read liked albums and tracks from Spotify"},
                   ((!stat.lastcheck)? "Read Library" :
                    ("checked " + jt.colloquialDate(
                        stat.lastcheck, true, "z2loc")))]]]); },
        writeDlgContent: function () {
            mgrs.webla.spimpNeeded();
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "stat")
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["span", {cla:"pathlabelspan"}, a.lab + ": "],
                        ["span", {cla:"pathspan", id:a.id},
                         mgrs.webla[a.valfname]()]]])],
                 ["div", {cla:"dlgbuttonsdiv"},
                  acts.filter((a) => a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", title:a.tt, onclick:a.oc},
                       a.n])]])); }
    };  //end mgrs.webla returned functions
    }());


    //Database check manager verifies the working database object
    mgrs.dbc = (function () {
        var stat = null;
        const sflds = [
            {fn:"el", dv:49, min:0, max:99},
            {fn:"al", dv:49, min:0, max:99},
            {fn:"kws", dv:""},
            {fn:"rv", dv:5, min:1, max:10},
            {fn:"fq", dv:"N"},
            {fn:"lp", dv:""},
            {fn:"nt", dv:""},
            {fn:"pc", dv:0, min:0, max:Number.MAX_SAFE_INTEGER},
            {fn:"srcid", dv:""},
            {fn:"srcrat", dv:""}];
        function err (et) {
            if(stat) {
                stat.verified = false;
                stat.errs.push(et); } }
    return {
        verifySong: function (song) {
            sflds.forEach(function (fld) {
                song[fld.fn] = song[fld.fn] || fld.dv;
                if(fld.min) {
                    song[fld.fn] = Math.max(song[fld.fn], fld.min); }
                if(fld.max) {
                    song[fld.fn] = Math.min(song[fld.fn], fld.max); } }); },
        verifyDatabase: function (dbo) {
            stat = {verified:true, errs:[], count:0};
            if(!dbo) {
                err("No database object given"); }
            if(!dbo.version) {
                err("dbo.version must be set by platform when dbo created"); }
            if(!dbo.songs || typeof dbo.songs !== "object") {
                err("dbo.songs is not an object"); }
            if(Array.isArray(dbo.songs)) {  //arrays are objects...
                err("dbo.songs is an array, not an object"); }
            if(stat.verified) {
                Object.entries(dbo.songs).forEach(function ([path, song]) {
                    if(!song || typeof song !== "object") {
                        err("song path " + path + " has no song object"); }
                    else {
                        stat.count += 1;
                        song.path = path;  //copy value into song for hub sync
                        mgrs.dbc.verifySong(song); } }); }
            dbo.songcount = dbo.songcount || 0;
            if(dbo.songcount > stat.count) {
                err("probable song loss: dbo.songcount " + dbo.songcount +
                    " > " + stat.count + " in dbo.songs"); }
            dbo.scanned = dbo.scanned || "";
            return stat; }
    };
    }());


    ////////////////////////////////////////////////////////////
    // Export actions
    ////////////////////////////////////////////////////////////

    //Export manager handles process of exporting a playlist
    mgrs.locxp = (function () {
        var dksongs = null;
    return {
        displayExportProgress: function (xob) {
            jt.out("exportdiv", xob.stat.state + " " + xob.stat.copied +
                   " of " + JSON.parse(xob.spec.songs).length); },
        cpxStart: function () {
            var dat = {count:{id:"xttlin", vs:"value"},
                       writepl:{id:"plcb", vs:"checked"},
                       plfilename:{id:"m3ufin", vs:"value"},
                       copymusic:{id:"fccb", vs:"checked"},
                       markplayed:{id:"mpcb", vs:"checked"}};
            Object.entries(dat).forEach(function ([key, attrs]) {
                dat[key] = jt.byId(attrs.id)[attrs.vs]; });
            dat.songs = JSON.stringify(  //array of song paths
                dksongs.slice(0, dat.count).map((s) => s.path));
            app.svc.dispatch("cpx", "exportSongs", dat,
                function (xob) {  //interim status display
                    mgrs.locxp.displayExportProgress(xob); },
                function (xob) {  //completion
                    mgrs.locxp.displayExportProgress(xob);
                    if(xob.spec.markplayed) {
                        dat.count = parseInt(dat.count, 10);
                        while(dat.count > 1) {
                            dat.count -= 1;
                            app.deck.dispatch("dk", "skip", "cpx", 0); }
                        app.deck.update("song export"); } },
                function (code, errtxt) {
                    jt.out("exportdiv", "Export failed " + code +
                           ": " + errtxt); }); },
        cpxDialog: function () {  //local copy file export
            var config = app.svc.dispatch("loc", "getConfig");
            var m3uname = app.filter.dispatch("dsc", "name") + ".m3u";
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Copy To:"],
                   ["span", {cla:"pathspan"}, config.exPath]]],
                 ["div", {id:"exportdiv"},
                  [["div", {cla:"expoptdiv"},
                    [["input", {type:"number", id:"xttlin", size:3, value:20,
                                min:1, max:200}],
                     ["label", {fo:"xttlin"}, " songs from on deck"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"fccb", checked:"checked"}],
                     ["label", {fo:"fccb"}, "Copy music files"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"plcb", checked:"checked"}],
                     ["label", {fo:"plcb"}, "Make playlist "],
                     ["label", {fo:"m3ufin"}, " file "],
                     ["div", {id:"exportfileindiv"},
                      ["input", {type:"text", id:"m3ufin", value:m3uname,
                                 placeholder:m3uname, size:28}]]]],
                   ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                    ["button", {type:"button", onclick:mdfs("locxp.cpxStart")},
                     "Export"]]]]])); },
        writeDlgContent: function () {
            dksongs = app.deck.dispatch("dk", "songs");
            if(!dksongs.length) {
                return jt.out(tddi, "No songs on deck to export."); }
            mgrs.locxp.cpxDialog(); }
    };  //end mgrs.locxp returned functions
    }());


    //Export manager handles creating or updating a Spotify playlist
    //developer.spotify.com/documentation/general/guides/working-with-playlists
    //developer.spotify.com/documentation/web-api/reference/#category-playlists
    mgrs.webxp = (function () {
        var dksongs = null;
        var xpi = null;   //current persistent export information
        var xps = null;   //account settings exports info
        var xpmax = 100;  //maximum number of songs to write (PUT limit)
        var spud = "";    //spotify user id (username string)
        var spl = null;   //spotify playlist info
        function stat (msg, interim) {
            jt.out("expstatdiv", msg);
            if(interim) {
                jt.byId("exportbuttonsdiv").style.display = "none"; }
            else {
                jt.byId("exportbuttonsdiv").style.display = "block"; } }
        function makeErrFunc (desc) {
            return function (stat, msg) {
                stat(desc + " " + stat + ": " + msg); }; }
    return {
        markSongsPlayed: function () {
            var msg = "Wrote " + xpi.wrttl + " songs to " + xpi.name + ".";
            if(xpi.mp) {
                stat("Marking songs played...", true);
                app.deck.dispatch("dk", "markMultipleSongsPlayed", xpi.wrttl,
                    function () {
                        jt.out(tddi, msg); },
                    function (code, errtxt) {
                        stat("Marking songs played failed " + code + ": " +
                             errtxt); }); }
            else {  //not marking played
                jt.out(tddi, msg); } },
        notePlaylistWritten: function () {
            stat("Noting playlist written...", true);
            xpi.lastwrite = new Date().toISOString();
            xps.sp[xpi.name] = xpi;
            app.login.getAuth().settings.xps = xps;
            const acct = mgrs.aaa.getAccount();
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                mgrs.webxp.markSongsPlayed,
                function (code, errtxt) {
                    stat("Playlist " + xpi.spid + " settings " +
                         code + ": " + errtxt); }); },
        uploadPlaylistImage: function () {
            stat("Uploading playlist image...");
            app.svc.dispatch("spc", "upldimg", `playlists/${xpi.spid}/images`,
                             "img/appiconcropped.jpg",
                             mgrs.webxp.notePlaylistWritten,
                             function (stat, msg) {
                                 jt.log("Playlist image upload failed " + stat +
                                        ": " + msg);
                                 mgrs.webxp.notePlaylistWritten(); }); },
        writePlaylistContent: function () {
            stat("Writing songs to playlist...");
            const spuris = dksongs.slice(0, xpi.xttl).map((s) =>
                "spotify:track:" + s.spid.slice(2));
            xpi.wrttl = spuris.length;  //deck might have had fewer
            app.svc.dispatch("spc", "sjc", `playlists/${xpi.spid}/tracks`,
                             "PUT", {uris:spuris},
                             mgrs.webxp.uploadPlaylistImage,
                             makeErrFunc("Write tracks")); },
        verifyPlaylistId: function () {
            stat("Verifying playlist...", true);
            if(xpi.spid) {  //fetch the playlist to verify it exists
                app.svc.dispatch("spc", "sjc", `playlists/${xpi.spid}`,
                    "GET", null,
                    function (obj) {
                        spl = obj;
                        mgrs.webxp.writePlaylistContent(); },
                    function (stat, msg) {
                        jt.log("webxp.verifyPlaylistId " + xpi.spid +
                               "error " + stat + ": " + msg);
                        xpi.spid = "";  //write new playlist
                        mgrs.webxp.verifyPlaylistId(); }); }
            else {  //create new playlist
                stat("Creating new playlist...", true);
                const data = {name:xpi.name,
                              description:app.filter.dispatch("dsc", "desc")};
                app.svc.dispatch("spc", "sjc", `users/${spud}/playlists`,
                    "POST", data,
                    function (obj) {
                        spl = obj;
                        xpi.spid = spl.id;
                        mgrs.webxp.writePlaylistContent(); },
                    makeErrFunc("Create playlist")); } },
        verifyWrite: function () {
            stat("Validating...", true);
            mgrs.webxp.xpnChange();  //read form vals and update button
            if(!xpi.name) {
                return stat("Name your playlist"); }
            if(!(xpi.xttl >= 1 && xpi.xttl <= xpmax)) {
                return stat("Bad input for how many songs to export."); }
            app.svc.dispatch("spc", "userprof", function (userprof) {
                spud = userprof.id;
                mgrs.webxp.verifyPlaylistId(); }); },
        xpnChange: function () {
            var plname = jt.byId("plnin").value.trim();
            xpi = xps.sp[plname] || {};
            xpi.name = plname;
            xpi.xttl = Number(jt.byId("xttlin").value);
            xpi.mp = jt.byId("mpcb").checked;
            if(xpi.spid) {  //have spotify playlist id from previous write
                jt.out("plxpbutton", "Overwrite"); }
            else {
                jt.out("plxpbutton", "Create"); } },
        writeDlgContent: function () {
            dksongs = app.deck.dispatch("dk", "songs");
            if(!dksongs.length) {
                return jt.out(tddi, "No songs on deck to export."); }
            xps = app.login.getAuth().settings.xps || {};
            xps.sp = xps.sp || {};
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"expoptdiv"},
                  [["label", {fo:"plnin"}, "Playlist Name: "],
                   ["input", {type:"text", id:"plnin", size:28,
                              placeholder:"DiggerPlaylistName",
                              value:"",  //set after dialog created
                              oninput:mdfs("webxp.xpnChange", "event"),
                              list:"xpndatalist"}],
                   ["datalist", {id:"xpndatalist"},
                    Object.keys(xps.sp).sort().map((pln) =>
                        ["option", {value:pln}])]]],
                 ["div", {cla:"expoptdiv"},
                  ["with ",
                   ["input", {type:"number", id:"xttlin", size:3, value:20,
                              min:1, max:xpmax}],
                   ["label", {fo:"xttlin"}, " songs from on deck"]]],
                 ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                 ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                  ["button", {type:"button", id:"plxpbutton",
                              onclick:mdfs("webxp.verifyWrite")},
                   "Create"]],
                 ["div", {id:"expstatdiv"}]]));
            jt.byId("plnin").value = app.filter.dispatch("dsc", "name");
            mgrs.webxp.xpnChange(); } //verify button name if input val cached
    };  //end mgrs.webxp returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General interface
    ////////////////////////////////////////////////////////////

    //general manager is main interface for the module
    mgrs.gen = (function () {
        var sddv = "";  //startdata digger version
        function initDisplay () {
            jt.out("pantopdiv", jt.tac2html(
                [["div", {id:"titlediv"},
                  [["div", {id:"titleftdiv"},
                    ["a", {href:"#DiggerHub",
                           onclick:mdfs("gen.togtopdlg", "am")},
                     ["span", {id:"hubtogspan", cla:"titlespan",
                               title:"Sign In or Choose Account"},
                      "Digger"]]],
                   ["div", {id:"titcenterdiv"},
                    ["a", {href:"#database", title:"Library Actions",
                           onclick:mdfs("gen.togtopdlg", "la")},
                     ["img", {cla:"buttonico",
                              src:"img/recordcrate.png"}]]],
                   ["div", {id:"titrightdiv"},
                    [["span", {id:"countspan"}, "Loading..."],
                     ["div", {id:"rtfmdiv"},
                      ["a", {href:"/docs/manual.html", title:"Digger manual",
                             onclick:jt.fs("app.displayDoc('" + app.overlaydiv +
                                           "','manual.html')")},
                       "RTFM"]]]]]],
                 ["div", {id:tddi, "data-mode":"empty"}],
                 ["div", {cla:"statdiv", id:"toponelinestatdiv"}],
                 ["div", {cla:"statdiv", id:"topstatdiv"}]])); }
    return {
        initialize: function () { initDisplay(); },
        togtopdlg: function (mode, cmd) {
            var dlgdiv = jt.byId(tddi);
            if(cmd === "close" || (!cmd && dlgdiv.dataset.mode === mode)) {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {
                dlgdiv.dataset.mode = mode;
                if(mode === "am") {  //account management
                    dlgdiv.style.display = "block";
                    dlgdiv.style.margin = "0px";
                    mgrs.afg.accountFanGroup(); }
                else { //"la" - library actions
                    dlgdiv.style.display = "table";
                    dlgdiv.style.margin = "auto";
                    mgrs[app.svc.plat("hdm") + mode].writeDlgContent(); } } },
        initialDataLoaded: function (startdata) {
            mgrs.aaa.setConfig(startdata.config);
            sddv = startdata.songdata.version;
            mgrs.kwd.rebuildKeywords();  //rest of UI will be completely rebuilt
            const ca = mgrs.aaa.getAccount();
            mgrs.gen.updateHubToggleSpan(ca);
            if(app.haveHubCredentials()) {
                setTimeout(function () {
                    mgrs.fma.fetchMessagesIfStale(
                        function () { jt.log("fma.fetchMessages completed"); },
                        function (cd, et) {
                            jt.log("fma.fetchMessages " + cd +
                                   ": " + et); }); },
                           200);
                setTimeout(mgrs.ppc.checkPrivacyPolicyTimestamp, 600); } },
        updateHubToggleSpan: function (acct) {
            jt.byId("hubtogspan").title = "Account Info (" +
                (acct.diggerVersion || sddv) + ", p" + app.fileVersion() + ")";
            jt.out("hubtogspan", acct.firstname); },
        dispCount: function (count, type) {
            switch(type) {
            case "total": count = "+" + count + "&nbsp;songs"; break;
            case "avail": count = String(count) + "&nbsp;songs"; break;
            default: count = String(count); }
            jt.out("countspan", count); },
        songDataVersion: function () { return sddv; }
    };  //end mgrs.gen returned functions
    }());


return {
    init: function () {
        Object.entries(mgrs).forEach(function ([name, mgr]) {
            if(mgr.initialize) {
                jt.log("initializing top." + name);
                mgr.initialize(); } }); },
    initialDataLoaded: function (sd) { mgrs.gen.initialDataLoaded(sd); },
    markIgnoreSongs: function () { mgrs.igf.markIgnoreSongs(); },
    rebuildKeywords: function () { mgrs.kwd.rebuildKeywords(); },
    dispCount: function (c, t) { mgrs.gen.dispCount(c, t); },
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.top, args);
        } catch(e) {
            jt.log("top.dispatch " + mgrname + "." + fname + " " + e +
                   " " + new Error("stack trace").stack);
        } }
};  //end of module returned functions
}());
