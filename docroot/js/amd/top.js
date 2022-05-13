/*global app, jt, confirm */
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
                    jt.err("You are running " + verstat.loc +
                           ". DiggerHub.com has " + verstat.hub +
                           ". Download and install the new app."); } } }
    };  //end mgrs.hcu returned functions
    }());


    //Song rating data synchronization between local app and DiggerHub
    mgrs.srs = (function () {
        const syt = {tmo:null, stat:"", resched:false, up:0, down:0};
        var upldsongs = null;
        var contexts = {signin:1800, unposted:4000, reset:1200,
                        standard:20 * 1000};
        function isNewlyPlayed (s) {
            return s.lp && s.lp > (s.modified || ""); }
        function notPostedYet (s) {
            return (!s.dsId && s.ti && s.ar &&
                    (!s.fq || !(s.fq.startsWith("D") ||
                                s.fq.startsWith("U")))); }
        function haveUnpostedNewSongs () {
            return Object.values(app.svc.dispatch("loc", "songs"))
                .some((s) => notPostedYet(s)); }
        function uploadableSongs () {
            return Object.values(app.svc.dispatch("loc", "songs"))
                .filter((s) => isNewlyPlayed(s) || notPostedYet(s)); }
    return {
        handleSyncError: function (code, errtxt) {
            upldsongs = null;
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.asu.signOut(mgrs.aaa.getAccount(), true); }
            jt.log("syncToHub " + code + ": " + errtxt); },
        syncToHub: function (context) {
            var curracct = mgrs.aaa.getAccount();
            if(!curracct || curracct.dsId === "101" || !curracct.token ||
               !mgrs.ppc.policyAccepted()) {
                return; }  //invalid account or not set up yet
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
            var curracct = mgrs.aaa.getAccount();
            if(curracct.dsId === "101") {
                jt.out("modindspan", ""); //turn off comms indicator
                mgrs.srs.hubStatInfo("");
                return jt.log("hubSyncStart aborted since not signed in"); }
            syt.stat = "executing";
            mgrs.srs.hubStatInfo("processing...");
            jt.out("modindspan", jt.tac2html(
                ["a", {href:"#hubstatdetails", title:"Show hub work details",
                       onclick:mdfs("gen.togtopdlg", "la", "open")},
                 ["span", {cla:"indicatorlightcolor"},
                  "hub"]]));  //turn on work indicator
            app.svc.dispatch("loc", "hubSyncDat", mgrs.srs.makeSendSyncData(),
                function (updates) {
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
            if(syt.resched) {
                syt.resched = false;
                mgrs.srs.syncToHub(); }
            else if(haveUnpostedNewSongs()) {
                syt.resched = true;  //prevent interim fan suggestions.
                mgrs.srs.postNewSongsToHub(); }
            else {  //hub sync done
                setTimeout(mgrs.mfcm.checkContributions, 100);
                jt.out("modindspan", ""); } }, //turn off comms indicator
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
                if(upldsongs.some((s) => !s.dsId && app.deck.isUnrated(s))) {
                    mgrs.mfcm.noteNewUnratedSongUploaded(); }
                upldsongs = upldsongs.map((sg) => app.txSong(sg)); }
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
                app.svc.dispatch("loc", "noteUpdatedSongData", s); });
            const curracct = mgrs.aaa.getAccount();
            if(curracct.syncsince && curracct.syncsince < curracct.modified) {
                mgrs.srs.syncToHub(); } },  //more to download...
        postNewSongsToHub: function () {
            mgrs.srs.hubStatInfo("uploading...");
            syt.err = "";
            app.svc.dispatch("gen", "fanContributions",
                function (retcount) {
                    syt.up += retcount;
                    jt.log("postNewSongsToHub " + retcount + " songs.");
                    mgrs.srs.hubStatInfo("");
                    mgrs.srs.syncToHub("unposted"); },  //check if more
                function (code, errtxt) {  //do not retry on failure (loop)
                    syt.err = "Error " + code + ": " + app.pt(errtxt);
                    mgrs.srs.hubStatInfo(syt.err, true);
                    jt.log("postNewSongsToHub " + code + ": " + errtxt); }); },
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
            mgrs.srs.syncToHub("reset"); },
        hubSyncStable: function () {  //ran once and not currently scheduled
            return (syt.pcts && !syt.tmo && !syt.resched); }
    };  //end mgrs.srs returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General Account actions
    ////////////////////////////////////////////////////////////

    //Music fan contributions manager handles default rating contributions
    mgrs.mfcm = (function () {
        var updstat = {inprog:false, pass:0, total:0};
        function doneRemoving () {
            jt.out("mfstatdiv", updstat.rmf.dispname + " removed.");
            app.deck.dispatch("ws", "rebuild", "removeFan");
            mgrs.mfnd.fansForm(); }
        function removeDefaultRatings () {
            updstat.inprog = "remove";
            updstat.rmpass += 1;
            app.svc.dispatch("gen", "clearFanRatings", updstat.rmf.dsId,
                function (retcount) {
                    updstat.inprog = false;
                    if(!retcount) { //no more default ratings to remove
                        return doneRemoving(); }
                    jt.out("mfstatdiv", "Pass " + updstat.pass + " removed " +
                           retcount + " default ratings.");
                    removeDefaultRatings(); },
                function (code, errtxt) {
                    updstat.inprog = false;
                    jt.out("mfstatdiv", "removeDefaultRatings " + code + ": " +
                           errtxt); }); }
        function updateMFContribs () {
            updstat.inprog = "contributions";
            updstat.pass += 1;
            jt.out("mfstatdiv", "Checking fan contributions...");
            app.svc.dispatch("gen", "fanContributions",
                function (retcount) {
                    updstat.inprog = false;
                    updstat.total += retcount;
                    mgrs.mfnd.fansForm();  //resets mfstatdiv
                    if(!retcount) { //no more ratings returned
                        if(updstat.pass > 1) {  //got some ratings before
                            app.deck.dispatch("ws", "rebuildIfLow",
                                              "fancontrib", true); } }
                    else { //got some new ratings, check for more
                        //server can cut off access if calls are too tight
                        setTimeout(updateMFContribs, 4 * 1000); } },
                function (code, errtxt) {
                    updstat.inprog = false;
                    jt.out("mfstatdiv", "Contributions check failed " + code +
                           ": " + errtxt); }); }
    return {
        inProgress: function () { return updstat.inprog; },
        noteNewUnratedSongUploaded: function () {
            updstat.newsong = new Date().toISOString(); },
        removeContributions: function (mf) {
            if(updstat.inprog) {
                return jt.out("mfstatdiv", "In progress, " + updstat.inprog +
                              "..."); }
            jt.out("mfstatdiv", "Removing " + mf.dispname + "...");
            updstat.rmpass = 0;
            updstat.rmf = mf;
            removeDefaultRatings(); },
        checkContributions: function () {
            if(updstat.inprog) {
                return jt.log("checkContributions inprog " + updstat.inprog); }
            if(app.svc.plat("hdm") === "loc" &&
               !mgrs.srs.hubSyncStable()) {  //hubsync calls here as needed
                return jt.log("checkContributions waiting on hubSyncStable"); }
            if(!updstat.newsong && mgrs.mfnd.contribsUpToDate()) {
                return jt.log("Fan contributions up to date."); }
            delete updstat.newsong;
            updstat.pass = 0;
            setTimeout(updateMFContribs, 4 * 1000); }
    };  //end mgrs.mfcm returned functions
    }());


    //Music fan add manager handles form and workflow for adding a fan
    mgrs.mfad = (function () {
    return {
        fanInviteClick: function (ignore /*event*/) {
            jt.byId("mfinvdoneb").disabled = false;
            jt.byId("mfinvdonebdiv").style.opacity = 1.0; },
        inviteSendHTML: function (dat) {
            var me = mgrs.aaa.getAccount();
            var subj = "DiggerHub music fan invitation";
            var body = "Hi " + dat.firstname + ",\n\n" +
"I just added you as a music fan on DiggerHub!  Looking forward to pulling the best from each other's music libraries while digging through the stacks.\n\n" +
"Happy listening,\n" + me.firstname + "\n\n" +
"P.S. You should have already received an access link from " + suppem + "\n\n";
            var link = "mailto:" + dat.emaddr + "?subject=" +
                jt.dquotenc(subj) + "&body=" + jt.dquotenc(body) + "%0A%0A";
            return jt.tac2html(
                [["a", {href:link, id:"mfinvitelink",
                        onclick:mdfs("mfad.fanInviteClick", "event")},
                  "&gt;&gt; Send Invite to " + dat.firstname +
                  " &lt;&lt;&nbsp; "],
                 ["div", {id:"mfinvdonebdiv", style:"opacity:0.4"},
                  ["button", {type:"button", id:"mfinvdoneb", disabled:true,
                              onclick:mdfs("mfnd.fansForm", "event")},
                   "Done"]]]); },
        createFan: function () {
            var dat = {emaddr:jt.byId("mfemin").value,
                       firstname:jt.byId("fannamein").value};
            if(!dat.emaddr || !dat.firstname) { return; }
            jt.out("mfsubformbdiv", "Creating...");
            app.svc.dispatch("gen", "createFan", dat,
                function () {
                    mgrs.mfnd.noteAddRemoveFan();
                    jt.out("mfsubstatdiv", "");
                    jt.out("mfsubformdiv", mgrs.mfad.inviteSendHTML(dat)); },
                function (code, errtxt) {
                    mgrs.mfad.mfnameinput();
                    jt.out("mfsubformdiv", "Add failed " +
                           code + ": " + errtxt); }); },
        mfnameinput: function (ignore /*event*/) {
            if(!jt.byId("mfsubformbutton")) {
                jt.out("mfsubformbdiv", jt.tac2html(
                    ["button", {type:"button", id:"mfsubformbutton",
                                onclick:mdfs("mfad.createFan")},
                     "Create"])); }
            if(jt.byId("fannamein").value) {
                jt.byId("mfsubformbutton").disabled = false;
                jt.byId("mfsubformbdiv").style.opacity = 1.0; }
            else {
                jt.byId("mfsubformbutton").disabled = true;
                jt.byId("mfsubformbdiv").style.opacity = 0.4; } },
        inviteCreate: function () {
            jt.out("mfbdiv", "");  //Clear button and status
            jt.out("mfaddstatdiv", jt.tac2html(
                ["div", {id:"statformdiv"},
                 [["div", {id:"mfsubstatdiv"}, "Not found. Create and invite?"],
                  ["div", {id:"mfsubformdiv", cla:"formlinediv"},
                   [["label", {fo:"fannamein"}, "First name:"],
                    ["input", {id:"fannamein", type:"text", size:8,
                               oninput:mdfs("mfad.mfnameinput", "event")}],
                    ["div", {id:"mfsubformbdiv"}]]]]]));
            mgrs.mfad.mfnameinput(); }, //display disabled button
        addFan: function () {
            var emaddr = jt.byId("mfemin").value;
            if(!jt.isProbablyEmail(emaddr)) {
                return jt.out("mfstatdiv", "Need a valid email address..."); }
            jt.out("mfbdiv", "Adding...");
            app.svc.dispatch("gen", "addFan", emaddr,
                function () {
                    jt.log("Added fan " + emaddr);
                    mgrs.mfnd.noteAddRemoveFan();
                    mgrs.mfnd.fansForm(); },
                function (code, errtxt) {
                    mgrs.mfnd.fansForm();
                    jt.byId("mfemin").value = emaddr;
                    if(code === 404) {
                        return mgrs.mfad.inviteCreate(); }
                    jt.out("mfstatdiv", "Add failed " + code +
                           ": " + errtxt); }); },
        mfeminput: function (ignore /*event*/) {
            jt.out("mfstatdiv", "");
            if(!jt.byId("mfaddb")) {
                jt.out("mfbdiv", jt.tac2html(
                    ["button", {type:"button", id:"mfaddb",
                                onclick:mdfs("mfad.addFan")},
                     "Add"])); }
            if(jt.isProbablyEmail(jt.byId("mfemin").value)) {
                jt.byId("mfaddb").disabled = false;
                jt.byId("mfbdiv").style.opacity = 1.0; }
            else {
                jt.byId("mfaddb").disabled = true;
                jt.byId("mfbdiv").style.opacity = 0.4; } },
        redisplayAddForm: function () {
            jt.out("mfaddiv", jt.tac2html(
                ["div", {id:"addmfdiv"},
                 [["label", {fo:"mfemin"}, "New music fan's email: "],
                  ["input", {type:"email", id:"mfemin",
                             oninput:mdfs("mfad.mfeminput", "event"),
                             placeholder:"fan@example.com"}],
                  ["div", {id:"mfbdiv"}],  //button or wait marker
                  ["div", {id:"mfaddstatdiv"}]]]));  //workflow stat div
            mgrs.mfad.mfeminput(); }
    };  //end mgrs.mfad returned functions
    }());


    //Music fan display management and song push contact
    mgrs.mfds = (function () {
        const ag = "&#x21c4;";  //right arrow over left arrow glyph
        const opts = [ag + " 1", ag + " 2", ag + " 3", ag + " 4", "-", "X"];
        function selopts (mf) {
            if(mf.status === "Active") { return opts.slice(0, -1); }
            return opts; }
        function selVal (oi, mf, idx) {
            var selected = ((mf.status === "Active" && oi === idx) ||
                            (mf.status === "Inactive" && oi === 4));
            return jt.toru(selected, "selected"); }
        function activeSel (mf, idx) {
            return ["select", {id:"mfsel" + idx,
                               onchange:mdfs("mfds.adjustOrder", idx)},
                    selopts(mf).map((opt, oi) =>
                        ["option", {value:oi, selected:selVal(oi, mf, idx)},
                         opt])]; }
        function dispName (mf, idx) {
            return ["span", {cla:"dispnamespan", id:"dispnamespan" + idx,
                             onclick:mdfs("mfds.editDispName", idx)},
                    mf.dispname]; }
        function dhCount (mf, idx) {
            return ["span", {cla:"dhcspan", id:"dhcspan" + idx},
                    mf.dhcontrib + "&#x2190;"]; }  //nn<-
        function obCount (mf, idx) {
            return ["span", {cla:"obcspan", id:"obcspan" + idx},
                    "&#x2192;" + mf.obcontrib]; }  //->nn
        function contact (mf) {
            var song = app.player.song(); var subj = ""; var body = "";
            if(song) {
                subj = "diggin " + song.ti;
                body = "Thought you would like this song I'm listening to\n\n" +
                    "Title: " + song.ti + "\n" +
                    "Artist: " + song.ar + "\n" +
                    "Album: " + song.ab + "\n";
                if(song.kws) {
                    body += "(" + song.kws + ")\n"; }
                body += "\n\nIf not attached, find a link at\n" +
                    "https://" + hubdom + "/songfinder?songid=" + song.dsId; }
            const link = "mailto:" + mf.email +
                  "?subject=" + jt.dquotenc(subj) +
                  "&body=" + jt.dquotenc(body) + "%0A%0A";
            return ["span", {cla:"emcspan"},
                    ["a", {href:link,
                           onclick:mdfs("mfds.fanEmailClick", "event")},
                     ["img", {cla:"buttonico", src:"img/email.png"}]]]; }
    return {
        fanEmailClick: function (event) {
            jt.log("fanEmailClick " + event.target.innerHTML); },
        editDispName: function (idx) {
            if(!jt.byId("mfnamein" + idx)) {  //not already editing
                jt.out("dispnamespan" + idx, jt.tac2html(
                    ["input", {id:"mfnamein" + idx, type:"text", size:8,
                               value:mgrs.mfnd.musfs()[idx].dispname,
                               onblur:mdfs("mfds.nameChange", idx),
                               onchange:mdfs("mfds.nameChange", idx)}]));
                jt.byId("mfnamein" + idx).focus(); } },
        nameChange: function (idx) {
            var musfs = mgrs.mfnd.musfs();
            var prevname = musfs[idx].dispname;
            var name = jt.byId("mfnamein" + idx).value;
            if(!name) { musfs[idx].dispname = musfs[idx].firstname; }
            if(name !== prevname) {
                musfs[idx].dispname = name;
                mgrs.mfnd.updateMusicFans(musfs); }
            mgrs.mfds.redisplayFans(); },
        adjustOrder: function (selidx) {
            var musfs = mgrs.mfnd.musfs();
            var mf = musfs[selidx];
            var optidx = jt.byId("mfsel" + selidx).selectedIndex;
            var contf = null;
            if((optidx === opts.length - 1) &&
               (confirm("Delete " + mf.dispname + "?"))) {
                if(mgrs.mfcm.inProgress()) {
                    jt.out("mfstatdiv", "Still removing, retry in a minute."); }
                else {
                    mgrs.mfcm.removeContributions(mf);
                    musfs.splice(selidx, 1); } }
            else {
                if(optidx <= 3) {
                    if(mf.status === "Inactive") {  //activating...
                        contf = mgrs.mfcm.checkContributions; }
                    mf.status = "Active"; }
                else {
                    mf.checksince = "";  //reset to force refresh when activated
                    mf.status = "Inactive"; }
                musfs.splice(optidx, 0, musfs.splice(selidx, 1)[0]); }
            musfs = mgrs.mfnd.sortAndMax4Active(musfs);
            mgrs.mfnd.updateMusicFans(musfs, contf);
            mgrs.mfds.redisplayFans(); },
        redisplayFans: function () {
            var musfs = mgrs.mfnd.musfs();
            jt.out("mfdsdiv", jt.tac2html(
                musfs.map((mf, idx) => 
                    ["div", {cla:"mflinediv"},
                     [["div", {cla:"mflediv"}, activeSel(mf, idx)],
                      ["div", {cla:"mflediv"}, contact(mf, idx)],
                      ["div", {cla:"mflediv"}, dispName(mf, idx)],
                      ["div", {cla:"mflediv"}, dhCount(mf, idx)],
                      ["div", {cla:"mflediv"}, obCount(mf, idx)]]]))); }
    };  //end mgrs.mfds returned functions
    }());


    //Music fan manager handles main display and access functions
    mgrs.mfnd = (function () {
        var mst = {ds:"init"};
    return {
        activeFansIdCSV: function () {  //svc.web.fetchSongsDeck
            return mgrs.mfnd.musfs()
                .filter((mf) => mf.status === "Active")
                .map((mf) => mf.dsId)
                .join(","); },
        contribsUpToDate: function () {
            const ctms = 24 * 60 * 60 * 1000;
            const due = new Date(Date.now() - ctms).toISOString();
            const cmfs = mgrs.mfnd.musfs().filter((mf) =>
                mf.status === "Active" && mf.checksince < due);
            if(cmfs.length) {
                jt.log("Contributions check needed for " + JSON.stringify(
                    cmfs.map((mf) => mf.firstname + mf.checksince)));
                return false; }
            return true; },
        sortAndMax4Active: function (musfs) {
            musfs.sort(function (a, b) {
                if(a.status === "Inactive" && b.status === "Inactive") {
                    return a.dispname.localeCompare(b.dispname); }
                if(a.status === "Active") { return -1; }
                if(b.status === "Active") { return 1; }
                return 0; });  //sort is stable, so Actives order preserved
            musfs.forEach(function (mf, idx) {
                if(idx > 3) { mf.status = "Inactive"; } });
            return musfs; },
        verifyFanDefs: function (musfs) {
            musfs = musfs.filter((mf) => mf.dsId && mf.email && mf.firstname);
            musfs.forEach(function (mf) {
                mf.dispname = mf.dispname || mf.firstname;
                mf.dhcontrib = mf.dhcontrib || 0;
                mf.obcontrib = mf.obcontrib || 0;
                if(mf.status !== "Active") {
                    mf.status = "Inactive"; } });
            return mgrs.mfnd.sortAndMax4Active(musfs); },
        updateMusicFans: function (musfs, contf, errf) {
            var curracc = mgrs.aaa.getAccount();
            curracc.musfs = musfs;
            contf = contf || function () {
                jt.log("top.mfnd.updateMusicFans account saved."); };
            errf = errf || function (code, errtxt) {
                jt.log("top.mfnd.updateMusicFans account save failed " +
                       code + ": " + errtxt); };
            mgrs.aaa.updateCurrAcct(curracc, curracc.token, contf, errf); },
        musfs: function () {
            var curracc = mgrs.aaa.getAccount(); var musfs;
            if(!curracc) {
                jt.log("top.mfnd.musfs no curracc, returning empty array");
                return []; }
            if(!Array.isArray(curracc.musfs)) {
                curracc.musfs = []; }
            musfs = curracc.musfs;
            if(mst.ds === "init") {
                musfs = mgrs.mfnd.verifyFanDefs(musfs);
                mgrs.mfnd.updateMusicFans(musfs, function () {
                    mst.ds = "verified";
                    mgrs.mfcm.checkContributions(); }); }
            return musfs; },
        noteAddRemoveFan: function () {
            mst.ds = "init"; },  //rebuild needed fan fields
        fansForm: function () {
            if(!jt.byId("hubacctcontdiv")) { return; }
            jt.out("hubacctcontdiv", jt.tac2html(
                ["div", {id:"mfsdiv"},
                 [["div", {id:"mfstatdiv"}],  //always visible
                  ["div", {id:"mfscontdiv"},  //~6 lines high, scrollable
                   [["div", {id:"mfdsdiv"}],
                    ["div", {id:"mfaddiv"}]]]]]));
            mgrs.mfds.redisplayFans();
            mgrs.mfad.redisplayAddForm();
            if(mst.ds === "verified") {
                mgrs.mfcm.checkContributions(); } }
    };  //end mgrs.mfnd returned functions
    }());


    //Fan group actions manager handles connecting with other fans
    mgrs.fga = (function () {
    return {
        connectForm: function (/*acct*/) {
            jt.out("afgcontdiv", "Not implemented yet"); },
        activityForm: function (/*acct*/) {
            jt.out("afgcontdiv", "Not implemented yet"); },
        messagesForm: function (/*acct*/) {
            jt.out("afgcontdiv", "Not implemented yet"); }
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
            {n:"email", dn:"email", m:"pw", ty:"readonly"},
            {n:"email", dn:"email", m:"js", ty:"email"},
            {n:"password", dn:"password", m:"js", ty:"password"},
            {n:"updemail", dn:"new email", m:"w", ty:"email"},
            {n:"updpassword", dn:"new password", m:"w", ty:"password"},
            {n:"firstname", dn:"first name", m:"jp", ty:"text"},
            {n:"digname", dn:"dig name", m:"jp", ty:"text"},
            {n:"privaccept", m:"jp", ty:"checkbox", p:app.subPlaceholders(
                "appoverlaydiv", app.svc.urlOpenSupp(),
                "I'm ok with the PRIVPOLICY")}];
        function makeInput (acct, aff) {
            var val = "";
            if(acct && acct[aff.n]) { val = acct[aff.n]; }
            if(jt.byId(aff.n + "in")) { val = jt.byId(aff.n + "in").value; }
            return ["input", {type:(aff.ty || "text"), id:aff.n + "in",
                              value:val, placeholder:(aff.p || "")}]; }
        function formTableRow (acct, aff) {
            switch(aff.ty) {
            case "checkbox": return jt.tac2html(
                ["tr",
                 ["td", {colspan:2},
                  [["input", {type:"checkbox", id:aff.n + "in",
                              value:new Date().toISOString()}],
                   ["label", {fo:aff.n + "in", id:aff.n + "label"}, aff.p]]]]);
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
        function accountFieldsForm (acct, mode, buttons, extra) {
            curracct = acct;  //update form processing account context
            extra = extra || "";
            jt.out("afgcontdiv", jt.tac2html(
                [["table",
                  affs.filter((aff) => (aff.m.includes(mode) &&
                                        !contextuallyObviated(aff)))
                  .map((aff) => formTableRow(acct, aff))],
                 ["div", {id:"afgstatdiv"}],
                 ["div", {cla:"dlgbuttonsdiv"}, buttons],
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
        function makeHubCall (buttonid, verb, endpoint, dat, contf) {
            jt.byId(buttonid).disabled = true;
            jt.out("afgstatdiv", "Calling DiggerHub...");
            const data = jt.objdata(dat);
            const errf = function (code, errtxt) {
                jt.byId(buttonid).disabled = false;
                jt.out("afgstatdiv", code + ": " + errtxt); };
            app.svc.dispatch("gen", "makeHubAcctCall", verb, endpoint, data,
                function (accntok) {
                    jt.out("afgstatdiv", "Saving...");
                    if(endpoint === "accntok") { //reset syncsince on new signin
                        accntok[0].syncsince = accntok[0].created + ";1"; }
                    if(endpoint.startsWith("mailpwr")) {
                        return contf(); }  //no account to update
                    mgrs.aaa.updateCurrAcct(accntok[0], accntok[1],
                        function (acct) {
                            jt.out("afgstatdiv", "Saved.");
                            if(app.svc.plat("hdm") === "loc") {
                                mgrs.srs.syncToHub(); } //check if sync needed
                            contf(acct); },
                        errf); },
                errf); }
    return {
        newacctForm: function (acct) {
            accountFieldsForm(acct, "j",
                ["button", {type:"button", id:"newacctb",
                            onclick:mdfs("asu.newacctProc", "newacctb")},
                 "Create Account"]); },
        newacctProc: function (buttonid) {
            const dat = formData("j");
            if(!formError(dat, [verifyEmail, verifyPwd, verifyFirst, verifyDN,
                                verifyPriv])) {
                makeHubCall(buttonid, "POST", "newacct", dat, function (acct) {
                    if(mgrs.afg.inApp()) {
                        mgrs.gen.updateHubToggleSpan(acct);
                        mgrs.gen.togtopdlg(null, "close"); }
                    else {  //standalone account management
                        mgrs.afg.accountFanGroup("personal"); } }); } },
        signinForm: function (acct) {
            accountFieldsForm(acct, "s",
                ["button", {type:"button", id:"signinb",
                            onclick:mdfs("asu.signinProc", "signinb")},
                 "Sign In"],
                ["a", {href:"#pwdreset", title:"Send password reset email",
                       onclick:mdfs("asu.emailPwdReset")},
                 "Send password reset"]); },
        signinProc: function (buttonid) {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail, verifyPwd])) {
                makeHubCall(buttonid, "POST", "acctok", dat, function (acct) {
                    if(mgrs.afg.inApp()) {
                        mgrs.gen.updateHubToggleSpan(acct);
                        mgrs.gen.togtopdlg(null, "close"); }
                    else { //standalone account management
                        mgrs.afg.accountFanGroup("personal"); } }); } },
        emailPwdReset: function () {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail])) {
                const url = app.cb("mailpwr", dat);
                makeHubCall("signinb", "GET", url, null, function () {
                    var msg = "Email sent.";
                    if(emsent) { msg += " Check spam folder."; }
                    emsent = new Date().toISOString();
                    jt.out("afgstatdiv", msg); }); } },
        profileForm: function (acct) {
            accountFieldsForm(acct, "p",
                ["button", {type:"button", id:"updateb",
                            onclick:mdfs("asu.profileProc", "updateb")},
                 "Update"]); },
        profileProc: function (buttonid) {
            const dat = formData("p");
            addAuthDataFields(dat);
            if(app.startParams.actcode) {
                dat.actcode = app.startParams.actcode; }
            if(!formError(dat, [verifyFirst, verifyDN, verifyPriv])) {
                makeHubCall(buttonid, "POST", "updacc", dat, function () {
                    if(mgrs.afg.inApp() && dat.privaccept) {  //checkbox done
                        mgrs.gen.togtopdlg(null, "close"); }
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
                    jt.out("afgstatdiv", "Credentials updated."); }); } },
        signOut: function (acct, confirmed) {
            if(!mgrs.afg.inApp() || confirmed || confirm("You will have to resync all your songs when you sign in again. Continue signing out?")) {
                if(app.svc.plat("hdm") === "loc") {
                    mgrs.srs.syncToHub("cancel"); }
                else { //"web"
                    app.login.dispatch("had", "signOut"); }
                mgrs.aaa.removeAccount(acct,
                    function () {
                        if(mgrs.afg.inApp()) {
                            mgrs.gen.updateHubToggleSpan(mgrs.aaa.getAccount());
                            mgrs.aaa.notifyAccountChanged(); }
                        mgrs.afg.accountFanGroup("offline"); },
                    function (code, errtxt) {
                        jt.out("afgstatdiv", code + ": " + errtxt); }); } }
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
                {h:"signout", t:"sign out", oc:"asu.signOut"},
                {h:"fans", t:"fans", oc:"afg.groups"}],
            groups: [
                {h:"connect", t:"connect", oc:"fga.connectForm"},
                {h:"activity", t:"activity", oc:"fga.activityForm"},
                {h:"messages", t:"messages", oc:"fga.messagesForm"},
                {h:"me", t:"me", oc:"afg.personal"}]};
    return {
        setDisplayDiv: function (divid) { tddi = divid; },  //hub site etc
        inApp: function () { return inapp; },
        setInApp: function (runningInApp) { inapp = runningInApp; },
        accountFanGroup: function (dispmode, midx) {
            var acct = mgrs.aaa.getAccount();
            if(acct && acct.dsId === "101") { acct = null; }
            midx = midx || 0;
            if(dispmode) {
                mode = dispmode; }
            else { //use default display
                if(!acct) { mode = "offline"; }
                else { mode = "groups"; } }
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
            if(mgr === "afg") {
                mgrs.afg.accountFanGroup(fun); }
            else {
                mgrs[mgr][fun](acct); } }
    };  //end mgrs.afg returned functions
    }());


    //App account access manager serves as central ref for account and config
    //Update DigAcc on hub first, then reflect in local/runtime config.
    mgrs.aaa = (function () {
        var dfltkeywords = {
            Social: {pos: 1, sc: 0, ig: 0, dsc: "Music I might select to play when other people are listening."},
            Personal: {pos: 2, sc: 0, ig: 0, dsc: "Music I might select to play when it's just me listening."},
            Office: {pos: 3, sc: 0, ig: 0, dsc: "Music that you can listen to while you work."},
            Dance: {pos: 4, sc: 0, ig: 0, dsc: "Music you would dance to."},
            Ambient: {pos: 0, sc: 0, ig: 0, dsc: "Music that can be listened to from zero to full attention, transitioning from and to silence."},
            Jazz: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Classical: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Talk: {pos: 0, sc: 0, ig: 0, dsc: "Spoken word."},
            Solstice: {pos: 0, sc: 0, ig: 0, dsc: "Holiday seasonal."}};
        var dfltigfolds = [  //Noisy folders that are typically not songs
            "Ableton", "Audiffex", "Audio Music Apps", "GarageBand",
            "JamKazam"];
        var cfg = null;  //runtime config object
        var curracct = null;
        function verifyDeserialized (acct) {
            if(typeof acct.settings === "string") {
                mgrs.hcu.deserializeAccount(acct); } }
        function resetCurrentAccountRef () {
            curracct = cfg.acctsinfo.accts.find((x) =>
                x.dsId === cfg.acctsinfo.currid);
            verifyDeserialized(curracct); }
    return {
        getAccount: function () { return curracct; },
        getConfig: function () { return cfg; },
        getAcctsInfo: function () { return cfg.acctsinfo; },
        setConfig: function (config) {
            cfg = config;
            resetCurrentAccountRef(); },
        verifyConfig: function () {
            cfg = cfg || {};
            if(cfg.acctsinfo) { return cfg; }  //already initialized
            cfg.acctsinfo = {currid:"", accts:[]};
            if(!cfg.acctsinfo.accts.find((x) => x.dsId === "101")) {
                const diggerbday = "2019-10-11T00:00:00Z";
                cfg.acctsinfo.accts.push(
                    {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                     created:diggerbday, modified:diggerbday + ";1",
                     email:suppem, token:"none", kwdefs:dfltkeywords,
                     igfolds:dfltigfolds}); }
            if(!cfg.acctsinfo.currid) {
                cfg.acctsinfo.currid = "101"; }
            resetCurrentAccountRef(); },
        reflectAccountChangeInRuntime: function (acct, token) {
            verifyDeserialized(acct);
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
                app.filter.dispatch("stg", "rebuildAllControls", true); } }
    };  //end mgrs.aaa returned functions
    }());


    //Privacy policy change manager handles checking things are up to date
    mgrs.ppc = (function () {
        var callsToCheck = 0;
        var pts = "";  //policy timestamp
    return {
        policyAccepted: function () {
            const acct = mgrs.aaa.getAccount();
            if(acct && acct.hubdat &&
               acct.hubdat.privaccept > pts) {
                return true; }
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
                    mgrs.afg.accountFanGroup("personal", 1); } }); }
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
            app.svc.dispatch("loc", "writeConfig", cdat,
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
            if(confirm("Restart the app to change the location of music files or data?")) {
                mgrs.cfg.launch(); } }
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
            return false; }
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
                kwdefs = {Social: {pos:1, sc:0, ig:0, dsc:""},
                          Personal: {pos:2, sc:0, ig:0, dsc:""},
                          Ambient:{pos:3, sc:0, ig:0, dsc:""},
                          Dance:{pos:4, sc:0, ig:0, dsc:""}}; } },
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
        var acts = [
            {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
             tt:"Configure music and data file locations", 
             p:"musicPath", n:"Music Files"},
            {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
             tt:"Configure music and data file locations",
             p:"dbPath", n:"Digger Data"},
            {ty:"info", htmlfs:"hubSyncInfoHTML"},
            {ty:"btn", oc:app.dfs("svc", "loc.loadLibrary"),
             tt:"Read all files in the music folder", n:"Read Files"},
            {ty:"btn", oc:mdfs("igf.igMusicFolders"),
             tt:"Ignore folders when reading music files", n:"Ignore Folders"},
            {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
             tt:"Choose keywords to use for filtering", n:"Choose Keywords"}];
        var slfrc = "";  //session library file import check
    return {
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
            app.deck.dispatch("dk", "removeFromDeck", song);
            app.deck.dispatch("hst", "noteSongPlayed", song);
            app.deck.dispatch("dk", "playnow", "hst", 0); },
        hubSyncInfoHTML: function () {
            if(mgrs.aaa.getAccount().dsId === "101") { return ""; }
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
        var acts = [  //library actions
            {ty:"stat", lab:"Spotify song count", id:"spscval",
             valfname:"songCount"},
            {ty:"stat", lab:"Spotify library", id:"splibval",
             valfname:"splibStat"},
            {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
             tt:"Choose keywords to use for filtering", n:"Choose Keywords"}];
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
        var dki = null;
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
                dki.songs.slice(0, dat.count).map((s) => s.path));
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
            dki = app.deck.deckinfo();
            if(!dki.songs.length) {
                return jt.out(tddi, "No songs on deck to export."); }
            mgrs.locxp.cpxDialog(); }
    };  //end mgrs.locxp returned functions
    }());


    //Export manager handles creating or updating a Spotify playlist
    //developer.spotify.com/documentation/general/guides/working-with-playlists
    //developer.spotify.com/documentation/web-api/reference/#category-playlists
    mgrs.webxp = (function () {
        var dki = null;   //deck information for export
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
            const spuris = dki.songs.slice(0, xpi.xttl).map((s) => 
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
            dki = app.deck.deckinfo();
            if(!dki.songs.length) {
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
    return {
        initDisplay: function () {
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
                      ["a", {href:"/docs/manual.html", title:"How Digger works",
                             onclick:jt.fs("app.displayDoc('appoverlaydiv'," +
                                           "'manual.html')")},
                       "RTFM"]]]]]],
                 ["div", {id:tddi, "data-mode":"empty"}],
                 ["div", {cla:"statdiv", id:"toponelinestatdiv"}],
                 ["div", {cla:"statdiv", id:"topstatdiv"}]])); },
        togtopdlg: function (mode, cmd) {
            var dlgdiv = jt.byId(tddi);
            if(cmd === "close" || (!cmd && dlgdiv.dataset.mode === mode)) {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {
                dlgdiv.dataset.mode = mode;
                if(mode === "am") {  //account management
                    mgrs.afg.accountFanGroup(); }
                else { //"la" - library actions
                    mgrs[app.svc.plat("hdm") + mode].writeDlgContent(); } } },
        initialDataLoaded: function (startdata) {
            mgrs.aaa.setConfig(startdata.config);
            sddv = startdata.songdata.version;
            mgrs.kwd.rebuildKeywords();  //rest of UI will be completely rebuilt
            mgrs.gen.updateHubToggleSpan(mgrs.aaa.getAccount());
            setTimeout(mgrs.ppc.checkPrivacyPolicyTimestamp, 600); },
        updateHubToggleSpan: function (acct) {
            jt.byId("hubtogspan").title = "Account Info (" +
                (acct.diggerVersion || sddv) + ", p" + app.fileVersion() + ")";
            jt.out("hubtogspan", acct.firstname); }
    };  //end mgrs.gen returned functions
    }());


return {
    init: function () { mgrs.gen.initDisplay(); },
    initialDataLoaded: function (sd) { mgrs.gen.initialDataLoaded(sd); },
    markIgnoreSongs: function () { mgrs.igf.markIgnoreSongs(); },
    rebuildKeywords: function () { mgrs.kwd.rebuildKeywords(); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.top, args); }
};  //end of module returned functions
}());
