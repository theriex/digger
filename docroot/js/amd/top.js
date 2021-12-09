/*global app, jt, confirm */
/*jslint browser, white, long, unordered */

//Top panel interface and actions
app.top = (function () {
    "use strict";

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
                    igfolds:{}, settings:{},
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
            var aci = mgrs.locam.getAcctsInfo();
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
            var curracct = mgrs.locam.getAccount();
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


    //Account To Hub manager handles changes to DiggerHub account info where
    //the change first needs to be reflected locally, then secondarily
    //updated at DiggerHub (if a DiggerHub account has been set up).
    mgrs.a2h = (function () {
        var syt = null;
        var upldsongs = null;
        var contexts = {signin:1800, unposted:4000, reset:1200,
                        standard:20 * 1000};
    return {
        initialSyncTask: function () {
            return {tmo:null, stat:"", resched:false, up:0, down:0}; },
        handleSyncError: function (code, errtxt) {
            upldsongs = null;
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.h2a.signOut(); }
            jt.log("syncToHub " + code + ": " + errtxt); },
        syncToHub: function (context) {
            var curracct = mgrs.locam.getAccount();
            if(!curracct || curracct.dsId === "101" || !curracct.token) {
                return; }  //invalid account or not set up yet
            syt = syt || mgrs.a2h.initialSyncTask();
            mgrs.a2h.hubStatInfo("scheduled.");
            if(syt.tmo) {  //already scheduled
                if(syt.stat) {  //currently running
                    syt.resched = true;  //reschedule when finished
                    return; }
                clearTimeout(syt.tmo); }  //not running. reschedule now
            syt.resched = false;
            syt.tmo = setTimeout(mgrs.a2h.hubSyncStart,
                                 contexts[context] || contexts.standard); },
        hubSyncStart: function () { //see ../../docs/hubsyncNotes.txt
            var curracct = mgrs.locam.getAccount();
            if(curracct.dsId === "101") {
                return jt.log("hubSyncStart aborted since not signed in"); }
            syt.stat = "executing";
            mgrs.a2h.hubStatInfo("processing...");
            jt.out("modindspan", jt.tac2html(
                ["a", {href:"#hubstatdetails", title:"Show hub work details",
                       onclick:mdfs("gen.togtopdlg", "la", "open")},
                 ["span", {cla:"indicatorlightcolor"},
                  "hub"]]));  //turn on work indicator
            app.svc.dispatch("loc", "hubSyncDat", mgrs.a2h.makeSendSyncData(),
                function (updates) {
                    mgrs.a2h.processReceivedSyncData(updates);
                    mgrs.a2h.hubSyncFinished(); },
                function (code, errtxt) {
                    mgrs.a2h.handleSyncError(code, errtxt);
                    mgrs.a2h.hubSyncFinished(); }); },
        hubSyncFinished: function () {
            syt.pcts = new Date().toISOString();
            syt.stat = "";
            mgrs.a2h.hubStatInfo("");
            syt.tmo = null;
            if(syt.resched) {
                syt.resched = false;
                mgrs.a2h.syncToHub(); }
            else if(mgrs.a2h.haveUnpostedNewSongs()) {
                syt.resched = true;  //prevent interim friend suggestions.
                mgrs.a2h.postNewSongsToHub(); }
            else {  //hub sync done
                setTimeout(mgrs.mfc.restartIfWaiting, 100);
                jt.out("modindspan", ""); } }, //turn off comms indicator
        txSgFmt: function (sg) {
            sg = JSON.parse(JSON.stringify(sg));
            delete sg.mrd;
            const flds = ["ti", "ar", "ab", "path"];
            flds.forEach(function (fld) {
                //paren expressions run afoul of web security rules. html esc
                sg[fld] = sg[fld].replace(/\(/g, "&#40;");
                sg[fld] = sg[fld].replace(/\)/g, "&#41;"); });
            return sg; },
        makeSendSyncData: function () {
            //send the current account + any songs that need sync.  If just
            //signed in, then don't send the current song or anything else
            //until after the initial download sync.
            var curracct = mgrs.locam.getAccount();
            upldsongs = [];
            if(!curracct.syncsince) {  //not initial account creation
                upldsongs = Object.values(app.svc.dispatch("loc", "songs"))
                    .filter((s) => s.lp > (s.modified || ""));
                upldsongs = upldsongs.slice(0, 199);
                upldsongs = upldsongs.map((sg) => mgrs.a2h.txSgFmt(sg)); }
            syt.up += upldsongs.length;
            mgrs.hcu.serializeAccount(curracct);
            const obj = {email:curracct.email, token:curracct.token,
                         syncdata:JSON.stringify([curracct, ...upldsongs])};
            mgrs.hcu.deserializeAccount(curracct);
            return jt.objdata(obj); },
        processReceivedSyncData: function (updates) {
            //received account + any songs that need to be saved locally.
            //Similar logic on server has already written the data to disk,
            //so just need to reflect in current runtime.
            var curracct = mgrs.locam.getAccount();
            var changed = mgrs.locam.noteReturnedCurrAcct(updates[0],
                                                          curracct.token);
            if(changed) { //need to rebuild display with updated info
                mgrs.locam.notifyAccountChanged(); }
            const songs = updates.slice(1);
            syt.down += songs.length;
            jt.log("processReceivedSyncData " + songs.length + " songs.");
            songs.forEach(function (s) {
                app.svc.dispatch("loc", "noteUpdatedSongData", s); });
            if(curracct.syncsince && curracct.syncsince < curracct.modified) {
                mgrs.a2h.syncToHub(); } },  //more to download...
        haveUnpostedNewSongs: function () {  //same test as hub.js mfcontrib
            var newsongs = Object.values(app.svc.dispatch("loc", "songs"))
                .filter((s) => (!s.dsId && s.ti && s.ar &&
                                (!s.fq || !(s.fq.startsWith("D") ||
                                            s.fq.startsWith("U")))));
            return newsongs.length; },
        postNewSongsToHub: function () {
            mgrs.a2h.hubStatInfo("uploading...");
            syt.err = "";
            app.svc.dispatch("gen", "friendContributions",
                function (retcount) {
                    syt.up += retcount;
                    jt.log("postNewSongsToHub " + retcount + " songs.");
                    mgrs.a2h.hubStatInfo("");
                    mgrs.a2h.syncToHub("unposted"); },  //check if more
                function (code, errtxt) {  //do not retry on failure (loop)
                    syt.err = "Error " + code + ": " + app.pt(errtxt);
                    mgrs.a2h.hubStatInfo(syt.err, true);
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
            mgrs.a2h.hubStatInfo(syt.err || "init", reset); },
        hubStatInfo: function (value, reset) {
            if(!jt.byId("hsistatspan")) { return; }
            if(value === "init") {
                if(syt.stat) { value = "processing..."; }
                else if(syt.tmo) { value = "scheduled."; } }
            if(reset) {
                value += " " + jt.tac2html(
                    ["a", {href:"#reset", onclick:mdfs("a2h.manualReset"),
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
            syt = null;
            mgrs.a2h.syncToHub("reset"); },
        hubSyncStable: function () {  //ran once and not currently scheduled
            return (syt && syt.pcts && !syt.tmo && !syt.resched); }
    };  //end mgrs.a2h returned functions
    }());


    //Hub To Account manager handles changes to DiggerHub account info where
    //the change first needs to take effect at DiggerHub, then be reflected
    //locally.  This is in contrast to things like settings which are
    //reflected first locally and then synchronized with DiggerHub.
    //Notes:
    //  - Changing an email address for an account requires prompting for a
    //    password to create a new phash for an access token.  Leaving this
    //    to be done directly on DiggerHub.
    //  - DigAcc.hashtag can be for a personal DiggerHub page or socmed.
    //    Can add later if used, not displaying until useful.
    mgrs.h2a = (function () {
        var affs = [  //account form fields for direct input or display
            //'j'oin, 's'ignin, pass'w'ordchg, 'p'rofile
            {n:"email", im:"js", dm:"pw", ty:"email", p:"nospam@example.com"},
            {n:"password", im:"js", ty:"password"},
            {n:"updpassword", im:"w", ty:"password", dn:"password"},
            {n:"firstname", im:"jp", p:"Name for display"}];
    return {
        removeAccount: function (aid) {
            jt.out("topstatdiv", "Removing account...");
            const aci = mgrs.locam.getAcctsInfo();
            if(aid === aci.currid) {
                aci.currid = "101"; }
            aci.accts = aci.accts.filter((a) => a.dsId !== aid);
            mgrs.locam.updateAccount(
                function (acctsinfo) {
                    jt.out("topstatdiv", "");
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    mgrs.gen.togtopdlg("am", "close"); },
                function (code, errtxt) {
                    jt.out("topstatdiv", code + ": " + errtxt); }); },
        signOut: function () {
            mgrs.h2a.removeAccount(mgrs.locam.getAccount().dsId); },
        usingDefaultAccount: function () {
            var curracct = mgrs.locam.getAccount();
            if(!curracct || curracct.dsId === "101") {
                return true; }
            return false; },
        updateHubAccount: function (contf, errf) {  //curracct already updated
            var data = mgrs.hcu.accountAsData(mgrs.locam.getAccount());
            app.svc.dispatch(
                "loc", "updateHubAccount", data,
                function (accntok) {
                    mgrs.h2a.writeUpdAcctToAccounts(accntok);
                    if(contf) {
                        contf(accntok); } },
                function (code, errtxt) {
                    jt.log("hub.h2a.updateHubAccount " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        writeUpdAcctToAccounts: function (accntok, contf, errf) {
            mgrs.locam.noteReturnedCurrAcct(accntok[0], accntok[1]);
            mgrs.gen.updateAccount(
                function (acctsinfo) {
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    if(contf) {
                        contf(acctsinfo); } },
                function (code, errtxt) {
                    jt.log("writeUpdAcctToAccounts " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        accountFieldsServiceCallPrep: function (buttonid, mode) {
            var dat = {};
            jt.out("hubacctstatdiv", "");  //clear any previous error
            jt.byId(buttonid).disabled = true;
            affs.filter((a) => a.im && a.im.includes(mode))
                .forEach(function (a) {
                    dat[a.n] = jt.byId(a.n + "in").value; });
            if(!(dat.email && dat.password)) {  //auth not included in call
                const curracct = mgrs.locam.getAccount();
                dat.an = curracct.email;
                dat.at = curracct.token; }
            dat = jt.objdata(dat);
            return {data:dat, errf:function (code, errtxt) {
                jt.byId(buttonid).disabled = false;
                jt.out("hubacctstatdiv", code + ": " + errtxt); }}; },
        createOrSignIn: function (endpoint, buttonid, mode) {
            var de = mgrs.h2a.accountFieldsServiceCallPrep(buttonid, mode);
            app.svc.dispatch("loc", "signInOrJoin", endpoint, de.data,
                function (accntok) {
                    accntok[0].syncsince = accntok[0].created + ";1";
                    mgrs.h2a.writeUpdAcctToAccounts(accntok,
                        function () {
                            mgrs.a2h.syncToHub("signin");
                            mgrs.gen.togtopdlg(null, "close"); },
                        de.errf); },
                de.errf); },
        profileUpdate: function (buttonid, mode) {
            var de = mgrs.h2a.accountFieldsServiceCallPrep(buttonid, mode);
            app.svc.dispatch("loc", "updateHubAccount", de.data,
                function (accntok) {
                    mgrs.h2a.writeUpdAcctToAccounts(accntok,
                        function () {
                            mgrs.a2h.syncToHub();
                            mgrs.h2a.profileForm(); },
                        de.errf); },
                de.errf); },
        passwordUpdate: function (buttonid, mode) {
            var de = mgrs.h2a.accountFieldsServiceCallPrep(buttonid, mode);
            jt.out("hubaccthelplinkdiv", "");
            app.svc.dispatch("loc", "updateHubAccount", de.data,
                function (accntok) {
                    mgrs.h2a.writeUpdAcctToAccounts(accntok,
                        function () {
                            mgrs.a2h.syncToHub();  //sync with new auth
                            jt.out("hubaccthelplinkdiv",
                                   "Password changed."); },
                        de.errf); },
                de.errf); },
        inputOrDisplay: function (mode, a) {
            var curracct = mgrs.locam.getAccount(); var val;
            if(curracct.dsId === "101") {
                curracct = {dsId:"", email:"", password:"", firstname:""}; }
            if(a.im && a.im.includes(mode)) {
                val = curracct[a.n] || "";
                const previn = jt.byId(a.n + "in");
                if(previn && previn.value) {
                    val = previn.value; }
                return ["input", {type:(a.ty || "text"),
                                  id:a.n + "in",
                                  value:val,
                                  placeholder:(a.p || "")}]; }
            return ["span", {cla:"formvalspan"}, curracct[a.n]]; },
        accountFieldsForm: function (mode, buttons, help) {
            help = help || "";
            jt.out("hubacctcontdiv", jt.tac2html(
                [["table",
                  affs.filter((a) => ((a.im && a.im.includes(mode)) ||
                                      (a.dm && a.dm.includes(mode))))
                  .map((a) =>
                      ["tr",
                       [["td", {cla:"formattr"}, (a.dn || a.n)],
                        ["td", mgrs.h2a.inputOrDisplay(mode, a)]]])],
                 ["div", {id:"hubacctstatdiv"}],
                 ["div", {cla:"dlgbuttonsdiv"}, buttons],
                 ["div", {id:"hubaccthelplinkdiv"}, help]])); },
        newacctForm: function () {
            mgrs.h2a.accountFieldsForm("j",
                ["button", {type:"button", id:"newacctb",
                            onclick:mdfs("h2a.createOrSignIn", "newacct",
                                         "newacctb", "j")},
                 "Create Account"]); },
        signInForm: function () {
            mgrs.h2a.accountFieldsForm("s",
                ["button", {type:"button", id:"signinb",
                            onclick:mdfs("h2a.createOrSignIn", "acctok",
                                         "signinb", "s")},
                 "Sign In"],
                ["a", {href:"#pwdreset", title:"Send password reset email",
                       onclick:mdfs("h2a.emailPwdReset")},
                 "Send password reset"]); },
        profileForm: function () {
            mgrs.h2a.accountFieldsForm("p",
                ["button", {type:"button", id:"updacctb",
                            onclick:mdfs("h2a.profileUpdate",
                                         "updacctb", "p")},
                 "Update Profile"]); },
        changePwdForm: function () {
            mgrs.h2a.accountFieldsForm("w",
                ["button", {type:"button", id:"updpwdb",
                            onclick:mdfs("h2a.passwordUpdate",
                                         "updpwdb", "w")},
                 "Change Password"]); },
        accountSettings: function (ix) {
            var redisp = true;
            var tas = [
                {h:"#friends", oc:"mfnd.friendsForm", t:"friends"},
                {h:"#profile", oc:"h2a.profileForm", t:"profile"},
                {h:"#password", oc:"h2a.changePwdForm", t:"password"},
                {h:"#signout", oc:"h2a.signOut", t:"sign out"}];
            if(mgrs.h2a.usingDefaultAccount()) {
                redisp = false;
                tas = [
                    {h:"#join", oc:"h2a.newacctForm", t:"join"},
                    {h:"#signin", oc:"h2a.signInForm", t:"sign in"}]; }
            ix = ix || 0;
            if(redisp || !jt.byId("hubacctcontdiv")) {
                jt.out("topdlgdiv", jt.tac2html(
                    ["div", {id:"hubacctdiv"},
                     [["div", {id:"hubaccttopdiv"},
                       tas.map((ta, sx) => jt.tac2html(
                           ["a", {href:ta.h, onclick:mdfs("h2a.accountSettings",
                                                          sx)},
                            ["span", {cla:((ix === sx)?
                                           "fhselspan" : "fhspan")},
                             ta.t]]))
                       .join(" &nbsp;|&nbsp ")],
                      ["div", {id:"hubacctcontdiv"}]]])); }
            const [m, f] = tas[ix].oc.split(".");
            mgrs[m][f](); },
        emailPwdReset: function () {
            jt.out("hubaccthelplinkdiv", "");
            const data = jt.objdata({email:jt.byId("emailin").value});
            app.svc.dispatch("loc", "emailPwdReset", data,
                function () {
                    jt.out("hubaccthelplinkdiv", "Sent reset email."); },
                function (code, errtxt) {
                    jt.out("hubaccthelplinkdiv", "Reset failed " + code + ": " +
                           errtxt); }); },
        noteSyncCompleted: function () {
            var ca = mgrs.locam.getAccount();
            if(jt.byId("fmvspanmodified")) {
                const lastsync = ca.syncsince || ca.modified;
                jt.out("fmvspanmodified", jt.tz2human(lastsync)); } }
    };  //end mgrs.h2a returned functions
    }());


    //Local Account manager handles hub account info from local server.
    mgrs.locam = (function () {
        var hai = null;  //hub accounts info (verified server side)
        var curracct = null;  //current account in use
    return {
        getAcctsInfo: function () { return hai; },
        noteReturnedCurrAcct: function (acct, token) {
            mgrs.hcu.deserializeAccount(acct);
            mgrs.hcu.verifyDefaultAccountFields(acct);
            acct.token = token;  //not included in returned data
            const changed = mgrs.hcu.accountDisplayDiff(curracct, acct);
            curracct = acct;
            hai.currid = acct.dsId;
            hai.accts = [acct,
                         ...hai.accts.filter((a) => a.dsId !== acct.dsId)];
            app.svc.dispatch("loc", "noteUpdatedAcctsInfo", hai);
            mgrs.hcu.verifyClientVersion();
            mgrs.h2a.noteSyncCompleted();
            return changed; },
        noteUpdatedAccountsInfo: function (acctsinfo) {
            curracct = null;  //clear any stale ref
            hai = acctsinfo;
            if(!hai || !hai.currid) {
                throw("Bad acctsinfo"); }
            hai.accts.forEach(function (acct) {
                acct.settings = acct.settings || {}; });
            curracct = hai.accts.find((a) => a.dsId === hai.currid);
            if(!curracct) {
                throw("No current account found"); }
            mgrs.gen.updateHubToggleSpan(curracct); },
        updateAccount: function (contf, errf) {  //curracct updated by caller
            app.svc.dispatch("loc", "updateAccount", hai,
                function (acctsinfo) {
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    mgrs.a2h.syncToHub();
                    if(contf) {  //calls notifyAccountChanged if needed
                        contf(acctsinfo); } },
                function (code, errtxt) {
                    jt.log("hub.locam.updateAccount " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        notifyAccountChanged: function (context) {
            if(!context || context === "keywords") {
                mgrs.kwd.rebuildKeywords();
                app.player.dispatch("kwd", "rebuildToggles");
                app.filter.dispatch("btc", "rebuildControls"); }
            if(!context || context === "igfolders") {
                mgrs.igf.redrawIgnoreFolders(); }
            if(!context || context === "settings") {
                app.filter.dispatch("stg", "rebuildAllControls", true); } },
        initialDataLoaded: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            mgrs.locam.noteUpdatedAccountsInfo(config.acctsinfo);
            mgrs.kwd.rebuildKeywords(); },
        writeDlgContent: function () { mgrs.h2a.accountSettings(); },
        getAccount: function () { return curracct; }
    };  //end mgrs.locam returned functions
    }());


    ////////////////////////////////////////////////////////////
    // Web Account actions
    ////////////////////////////////////////////////////////////

    //web account manager handles account/services when running on diggerhub
    mgrs.webam = (function () {
    return {
        initialDataLoaded: function () {
            mgrs.gen.updateHubToggleSpan(app.login.getAuth());
            mgrs.kwd.rebuildKeywords(); },
        writeDlgContent: function () {  //general account info on main site
            jt.out("topdlgdiv", jt.tac2html(["div", {id:"hubacctcontdiv"}]));
            mgrs.mfnd.friendsForm(); },
        getAccount: function () {
            return app.login.getAuth(); },
        updateAccount: function (contf, errf) {
            var acc = app.login.getAuth();
            var aadat = {kwdefs:JSON.stringify(acc.kwdefs),
                         igfolds:JSON.stringify(acc.igfolds),
                         settings:JSON.stringify(acc.settings),
                         musfs:JSON.stringify(acc.musfs)};
            aadat = app.svc.authdata(aadat);
            app.login.dispatch("act", "updateAccount", aadat, contf, errf); }
    };  //end mgrs.webam returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General Account actions
    ////////////////////////////////////////////////////////////

    //Music friend contribution manager handles contribution info display
    mgrs.mfc = (function () {
        var updstat = {inprog:false, pass:0, total:0};
        var hswtxt = "Waiting for hub sync...";
        function activeFriends () {
            return mgrs.mfnd.getMusicFriends()
                .filter((m) => m.status === "Active"); }
        function checkedToday (mf) {
            var dayms = 24 * 60 * 60 * 1000;
            var todaystart = new Date(Date.now() - dayms).toISOString();
            return mf.checksince >= todaystart; }
        function upToDate () {
            return activeFriends().every((m) => checkedToday(m)); }
    return {
        afterContributionsUpdated: function () {
            setTimeout(function () {
                app.deck.dispatch("ws", "rebuildIfLow", "friendcontrib"); },
                       200); },
        updateMFContribs: function () {
            if(updstat.inprog) { return; }
            updstat.inprog = true;
            updstat.pass += 1;
            app.svc.dispatch("gen", "friendContributions",
                function (retcount) {
                    updstat.inprog = false;
                    updstat.total += retcount;
                    mgrs.mfnd.rebuildMusicFriendRefs();
                    mgrs.mfnd.friendsForm();
                    //update the displays and trigger refetch as needed
                    activeFriends().forEach(function (ignore /*mf*/, idx) {
                        mgrs.mfnd.togFriendInfo(idx, "info"); });
                    mgrs.mfc.afterContributionsUpdated(); },
                function (code, errtxt) {
                    updstat.inprog = false;
                    jt.log("updateMFContribs " + code + ": " + errtxt);
                    jt.out("mfcispan" + activeFriends()[0].dsId,
                           code + ": " + errtxt); }); },
        contribInfo: function (mf) {
            var msg = "";
            mf.dhcontrib = mf.dhcontrib || 0;
            msg = mf.dhcontrib + " contributed.";
            if(!upToDate()) {
                if(app.svc.hostDataManager() === "loc" &&
                   !mgrs.a2h.hubSyncStable()) {
                    msg += " " + hswtxt; }
                else {
                    msg = mf.dhcontrib + " checking...";
                    if(!updstat.inprog) {
                        //server can cut off access if calls are too tight
                        setTimeout(mgrs.mfc.updateMFContribs, 4 * 1000); } } }
            return jt.tac2html(
                ["span", {cla:"mfcispan", id:"mfcispan" + mf.dsId}, msg]); },
        restartIfWaiting: function () {
            activeFriends().forEach(function (ignore /*mf*/, idx) {
                var infospan = jt.byId("mfselispan" + idx);
                if(infospan && infospan.innerHTML.indexOf(hswtxt) >= 0) {
                    mgrs.mfnd.togFriendInfo(idx, "info"); } }); },
        removeDefaultRatings: function () {
            if(updstat.inprog) { return; }
            updstat.inprog = true;
            updstat.rmpass += 1;
            app.svc.dispatch("gen", "clearFriendRatings", updstat.rmf.dsId,
                function (retcount) {
                    updstat.inprog = false;
                    if(!retcount) { //no more default ratings to remove
                        updstat.rmf.dhcontrib = 0;
                        updstat.rmf.checksince = "";
                        updstat.rmf.status = "Removed";
                        return updstat.rmcontf(); }
                    updstat.rmf.dhcontrib = Math.max(
                        updstat.rmf.dhcontrib - retcount, 0);
                    const span = jt.byId("mfselispan" + updstat.rmi);
                    span.innerHTML = jt.tac2html(
                        ["span", {cla:"mfcispan",
                                  id:"mfcispan" + updstat.rmf.dsId},
                         updstat.rmf.dhcontrib + " contributed."]);
                    span.dataset.mode = "info";
                    mgrs.mfc.removeDefaultRatings(); },
                updstat.rmerrf); },
        removeContributions: function (mf, idx, contf, errf) {
            if(updstat.inprog) {
                return jt.log("removeContributions already in progress."); }
            updstat.rmpass = 0;
            updstat.rmf = mf;
            updstat.rmi = idx;
            updstat.rmcontf = contf;
            updstat.rmerrf = errf;
            mgrs.mfc.removeDefaultRatings(); }
    };  //end mgrs.mfc returned functions
    }());


    //Music friend manager handles general display, changes and processing.
    mgrs.mfnd = (function () {
        var musfs = null;    //Active and Inactive friends by firstname, email.
        var actmfs = null;   //Active friends in priority order
    return {
        musicFriendsIdCSV: function () {  //util for svc.mgrs.web.fetchSongs
            if(!actmfs) {
                mgrs.mfnd.rebuildMusicFriendRefs(); }
            return actmfs.filter((m) => m).map((m) => m.dsId).join(","); },
        activeFriendIndex: function (dsId) {
            return actmfs.findIndex((m) => m.dsId === dsId); },
        getMusicFriends: function (curracc) {
            curracc = curracc || mgrs.gen.getAccount();
            if(!Array.isArray(curracc.musfs)) {
                curracc.musfs = []; }
            return curracc.musfs; },
        cleanMusicFriends: function () {
            var srcmfs = mgrs.mfnd.getMusicFriends();
            var fixmfs = [];
            var dlu = {};
            srcmfs.forEach(function (mf) {
                if(mf.actord) {
                    delete mf.actord; }
                if(!dlu[mf.dsId]) {
                    dlu[mf.dsId] = mf;
                    fixmfs.push(mf); } });
            mgrs.gen.getAccount().musfs = fixmfs;
            return fixmfs; },
        removeFriend: function (idx) {
            var errf = function (code, errtxt) {
                jt.out("mfstatdiv", "Remove " + code + ": " + errtxt); };
            jt.out("mfbdiv", "Removing...");  //disable button
            mgrs.mfc.removeContributions(actmfs[idx], idx,
                function () {
                    mgrs.mfnd.updateAccountMusicFriends(
                        function () {
                            mgrs.mfnd.rebuildMusicFriendRefs();
                            mgrs.mfnd.friendsForm();
                            app.deck.dispatch("ws", "rebuild",
                                              "removeFriend"); },
                        errf); },
                errf); },
        togRemoveFriend: function (idx) {
            if(actmfs[idx].email === jt.byId("mfemin").value) {  //toggle off
                mgrs.mfnd.friendsForm(); }  //not common op. just redraw.
            else {
                jt.byId("mfemin").value = actmfs[idx].email;
                jt.byId("mfbdiv").style.opacity = 1.0;
                jt.out("mfbdiv", jt.tac2html(
                    ["button", {type:"button",
                                onclick:mdfs("mfnd.removeFriend", idx)},
                     "Remove"])); } },
        updateAccountMusicFriends: function (contf, errf) {
            var ca = mgrs.gen.getAccount();
            var amfs = mgrs.mfnd.getMusicFriends(ca);
            ca.musfs = [...actmfs.filter((m) => m !== null),
                        ...musfs.filter((m) => m.status === "Inactive"),
                        ...amfs.filter((m) => m.status === "Removed")];
            contf = contf || function () {
                jt.log("updateAccountMusicFriends saved."); };
            errf = errf || function (code, errtxt) {
                jt.out("mfstatdiv", "updateAccountMusicFriends failed " +
                       code + ": " + errtxt); };
            mgrs.gen.updateAccount(contf, errf); },
        swapActive: function (idx) {
            var pmf = actmfs[idx];  //previously selected musical friend or null
            var sel = jt.byId("mfsel" + idx);
            var sid = sel.options[sel.selectedIndex].value;
            var smf = null;         //selected musical friend
            var saidx = -1;         //selected friend actmfs index
            if(sid) {
                smf = musfs.find((m) => m.dsId === sid);
                saidx = actmfs.findIndex((m) => m && m.dsId === smf.dsId); }
            if(!smf) {  //deactivating
                if(pmf) {  //previous may also have been empty select option
                    jt.log("deactivating " + pmf.firstname);
                    pmf.status = "Inactive"; }
                mgrs.mfnd.rebuildActiveMusicFriends(); }
            else if(smf && !pmf) {  //activating (previously blank slot)
                if(saidx >= 0) {  //already in active, attempting to add dupe
                    sel.value = "";
                    return; }
                jt.log("activating " + smf.firstname);
                smf.status = "Active";
                actmfs[idx] = smf; }
            else {  //have smf && pmf
                actmfs[idx] = smf;
                if(saidx >= 0) {  //selected friend in actmfs, swap positions
                    jt.log("swap " + pmf.firstname + " --> " + smf.firstname);
                    actmfs[saidx] = pmf; }
                else {  //move rest of active friends down to make room
                    jt.log("moving " + pmf.firstname + " down");
                    actmfs.splice(idx + 1, 0, pmf);  //move previous down
                    if(actmfs.length > 4 && actmfs[4]) {  //last falls off
                        actmfs[4].status = "Inactive"; }
                    actmfs = actmfs.slice(0, 4); } }
            mgrs.mfnd.updateAccountMusicFriends();  //background db write
            mgrs.mfnd.friendsForm();  //display changed values immediately
            if((pmf && pmf.status === "Inactive")||
               (smf && smf.status === "Active")) {
                app.deck.dispatch("ws", "rebuild", "friendActivation"); } },
        togFriendInfo: function (idx, mode) {
            var span = jt.byId("mfselispan" + idx);
            if(span.dataset.mode === "info" && mode !== "info") {
                span.dataset.mode = "email";
                span.innerHTML = mgrs.mfnd.mfMailLink(actmfs[idx]); }
            else {
                span.dataset.mode = "info";
                span.innerHTML = mgrs.mfc.contribInfo(actmfs[idx]); } },
        mfInfoToggle: function (mf, idx) {
            if(!mf) { return ""; }
            return jt.tac2html(
                ["a", {href:"#info", onclick:mdfs("mfnd.togFriendInfo", idx)},
                 ["img", {cla:"friendinfotogimg", src:"img/info.png"}]]); },
        friendEmailClick: function (event) {
            jt.log("friendEmailClick " + event.target.innerHTML); },
        mfMailLink: function (mf) {
            var subj = "diggin";
            if(!mf) { return ""; }
            const link = "mailto:" + mf.email +
                  "?subject=" + jt.dquotenc(subj) +
                  "&body=" + jt.dquotenc(
                      "\n\n" + mgrs.mfnd.currentSongsText()) + "%0A%0A";
            return jt.tac2html(
                ["a", {href:link,
                       onclick:mdfs("mfnd.friendEmailClick", "event")},
                 mf.email]); },
        mfNameSel: function (mf, idx) {
            if(!mf && idx < musfs.length) {
                mf = {dsId:0, firstname:""}; }
            if(!mf) { return ""; }
            return ["select", {id:"mfsel" + idx,
                               onchange:mdfs("mfnd.swapActive", idx)},
                    [["option", {value:""}, ""],
                     ...musfs.map((m) => ["option", {
                         value:m.dsId, selected:jt.toru((m.dsId === mf.dsId),
                                                        "selected")},
                                          m.firstname])]]; },
        mfLineNum: function (mf, idx) {
            var lno = (idx + 1) + ".";
            if(!mf) { return ["span", {cla:"mflinenospandis"}, lno]; }
            return ["span", {cla:"mflinenospan"},
                    ["a", {href:"#remove",
                           onclick:mdfs("mfnd.togRemoveFriend", idx)},
                     lno]]; },
        displayActiveFriends: function () {
            if(!musfs || !actmfs) {
                mgrs.mfnd.rebuildMusicFriendRefs(); }
            jt.out("amfsdiv", jt.tac2html(
                actmfs.map(function (mf, idx) {
                    return ["div", {cla:"musfseldiv", id:"musfseldiv" + idx},
                            [mgrs.mfnd.mfLineNum(mf, idx),
                             mgrs.mfnd.mfNameSel(mf, idx),
                             mgrs.mfnd.mfInfoToggle(mf, idx),
                             ["span", {cla:"mfselispan", id:"mfselispan" + idx},
                              mgrs.mfnd.mfMailLink(mf)]]]; }))); },
        rebuildActiveMusicFriends: function () {
            var rebmfs = musfs.filter((m) => m.status === "Active");
            actmfs = actmfs || [];
            rebmfs.sort(function (a, b) {
                var aidx = actmfs.findIndex((m) => m && m.dsId === a.dsId);
                var bidx = actmfs.findIndex((m) => m && m.dsId === b.dsId);
                return aidx - bidx; });
            actmfs = [...rebmfs, null, null, null, null];
            actmfs = actmfs.slice(0, 4); },
        rebuildMusicFriendRefs: function () {
            musfs = mgrs.mfnd.cleanMusicFriends();
            const mfsvs = ["Active", "Inactive"];
            musfs = musfs.filter((m) => mfsvs.includes(m.status));
            mgrs.mfnd.rebuildActiveMusicFriends();
            musfs.sort(function (a, b) {
                return (a.firstname.localeCompare(b.firstname) ||
                        a.email.localeCompare(b.email)); }); },
        currentSongsText: function () {
            var txt = "";
            var np = app.player.song();  //now playing
            if(np) {
                txt += np.ti + " - " + np.ar + " - " + np.ab + "\n"; }
            const dki = app.deck.deckinfo();
            dki.songs.slice(0, 5).forEach(function (song) {
                txt += song.ti + " - " + song.ar + " - " + song.ab + "\n"; });
            if(txt) {
                txt = "Cued up and playing:\n" + txt; }
            return txt; },
        friendInviteClick: function (ignore /*event*/) {
            jt.byId("mfinvdoneb").disabled = false;
            jt.byId("mfinvdonebdiv").style.opacity = 1.0; },
        inviteSendHTML: function (dat) {
            var me = mgrs.gen.getAccount();
            var subj = "DiggerHub music friend invitation";
            var body = "Hi " + dat.firstname + ",\n\n" +
"I just added you as a music friend on DiggerHub!  Looking forward to pulling the best from each other's music libraries while digging through the stacks.\n\n" +
"Happy listening,\n" + me.firstname + "\n\n" +
"P.S. You should have already received an access link from support@diggerhub.com\n\n" + mgrs.mfnd.currentSongsText();
            var link = "mailto:" + dat.emaddr + "?subject=" +
                jt.dquotenc(subj) + "&body=" + jt.dquotenc(body) + "%0A%0A";
            return jt.tac2html(
                [["a", {href:link, id:"mfinvitelink",
                        onclick:mdfs("mfnd.friendInviteClick", "event")},
                  "&gt;&gt; Send Invite to " + dat.firstname +
                  " &lt;&lt;&nbsp; "],
                 ["div", {id:"mfinvdonebdiv", style:"opacity:0.4"},
                  ["button", {type:"button", id:"mfinvdoneb", disabled:true,
                              onclick:mdfs("mfnd.friendsForm", "event")},
                   "Done"]]]); },
        createFriend: function () {
            var dat = {emaddr:jt.byId("mfemin").value,
                       firstname:jt.byId("friendnamein").value};
            if(!dat.emaddr || !dat.firstname) { return; }
            jt.out("mfsubformbdiv", "Creating...");
            app.svc.dispatch("gen", "createFriend", dat,
                function () {
                    mgrs.mfnd.rebuildMusicFriendRefs();
                    jt.out("mfsubstatdiv", "");
                    jt.out("mfsubformdiv", mgrs.mfnd.inviteSendHTML(dat)); },
                function (code, errtxt) {
                    mgrs.mfnd.friendsForm();
                    jt.out("mfsubformdiv", "Add failed " +
                           code + ": " + errtxt); }); },
        mfnameinput: function (ignore /*event*/) {
            if(!jt.byId("mfsubformbutton")) {
                jt.out("mfsubformbdiv", jt.tac2html(
                    ["button", {type:"button", id:"mfsubformbutton",
                                onclick:mdfs("mfnd.createFriend")},
                     "Create"])); }
            if(jt.byId("friendnamein").value) {
                jt.byId("mfsubformbutton").disabled = false;
                jt.byId("mfsubformbdiv").style.opacity = 1.0; }
            else {
                jt.byId("mfsubformbutton").disabled = true;
                jt.byId("mfsubformbdiv").style.opacity = 0.4; } },
        inviteCreate: function () {
            jt.out("mfbdiv", "");  //Clear button and status
            jt.out("mfstatdiv", jt.tac2html(
                ["div", {id:"statformdiv"},
                 [["div", {id:"mfsubstatdiv"}, "Not found. Create and invite?"],
                  ["div", {id:"mfsubformdiv", cla:"formlinediv"},
                   [["label", {fo:"friendnamein"}, "First name:"],
                    ["input", {id:"friendnamein", type:"text", size:8,
                               oninput:mdfs("mfnd.mfnameinput", "event")}],
                    ["div", {id:"mfsubformbdiv"}]]]]]));
            mgrs.mfnd.mfnameinput(); }, //display disabled button
        afterFriendAdded: function () {
            //added friend is at top. toggling info triggers an import fetch
            //of their data for use on a local server.
            mgrs.mfnd.togFriendInfo(0, "info"); },
        addFriend: function () {
            var emaddr = jt.byId("mfemin").value;
            if(!jt.isProbablyEmail(emaddr)) {
                return jt.out("mfstatdiv", "Need a valid email address..."); }
            jt.out("mfbdiv", "Adding...");
            app.svc.dispatch("gen", "addFriend", emaddr,
                function () {
                    jt.log("Added friend " + emaddr);
                    setTimeout(mgrs.mfnd.afterFriendAdded, 200);
                    musfs = null;
                    actmfs = null;
                    mgrs.mfnd.friendsForm(); },
                function (code, errtxt) {
                    mgrs.mfnd.friendsForm();
                    jt.byId("mfemin").value = emaddr;
                    if(code === 404) {
                        return mgrs.mfnd.inviteCreate(); }
                    jt.out("mfstatdiv", "Add failed " + code +
                           ": " + errtxt); }); },
        mfeminput: function (ignore /*event*/) {
            jt.out("mfstatdiv", "");
            if(!jt.byId("mfaddb")) {
                jt.out("mfbdiv", jt.tac2html(
                    ["button", {type:"button", id:"mfaddb",
                                onclick:mdfs("mfnd.addFriend")},
                     "Add"])); }
            if(jt.isProbablyEmail(jt.byId("mfemin").value)) {
                jt.byId("mfaddb").disabled = false;
                jt.byId("mfbdiv").style.opacity = 1.0; }
            else {
                jt.byId("mfaddb").disabled = true;
                jt.byId("mfbdiv").style.opacity = 0.4; } },
        friendsForm: function () {
            jt.out("hubacctcontdiv", jt.tac2html(
                ["div", {id:"mfsdiv"},
                 [["div", {id:"addmfdiv"},
                   [["label", {fo:"mfemin"}, "Music friend's email: "],
                    ["input", {type:"email", id:"mfemin",
                               oninput:mdfs("mfnd.mfeminput", "event"),
                               placeholder:"friend@example.com"}],
                    ["div", {id:"mfbdiv"}],
                    ["div", {id:"mfstatdiv"}]]],
                  ["div", {id:"amfsdiv"}]]]));
            mgrs.mfnd.mfeminput();  //display disabled button
            mgrs.mfnd.displayActiveFriends(); }
    };  //end mgrs.mfnd returned functions
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
            var aifs = mgrs.locam.getAccount().igfolds || [];
            if(!Array.isArray(aifs)) { aifs = []; }
            return aifs; }
    return {
        igMusicFolders: function () {
            jt.out("topdlgdiv", jt.tac2html(
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
            mgrs.locam.getAccount().igfolds = igfolds;
            jt.out("igfstatdiv", "Updating ignore folders...");
            mgrs.locam.updateAccount(
                function () {
                    jt.out("igfstatdiv", "");
                    mgrs.igf.unmarkIgnoreSongs();
                    mgrs.igf.markIgnoreSongs();
                    mgrs.locam.notifyAccountChanged("igfolders"); },
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
            kwdefs = mgrs.gen.getAccount().kwdefs;
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
            jt.out("topdlgdiv", jt.tac2html(
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
            //either showing the full keywords form, or swapping a bowtie ctrl
            if(jt.byId("kwdefupdb")) {  //called from local form
                jt.byId("kwdefupdb").disabled = true;  //debounce button
                jt.out("kwupdstatdiv", "Saving..."); }
            if(mgrs.kwd.keywordDefsError()) { return; }
            uka.forEach(function (kd) {  //update kwdefs directly
                var def = {pos:kd.pos, sc:kd.sc, ig:kd.ig, dsc:kd.dsc || ""};
                var descr = jt.byId(kd.kw + "descrdiv");
                if(descr) {
                    descr = descr.innerText || "";
                    def.dsc = descr.trim(); }
                mgrs.gen.getAccount().kwdefs[kd.kw] = def; });
            mgrs.locam.updateAccount(
                function () {
                    mgrs.gen.togtopdlg("", "close");
                    mgrs.locam.notifyAccountChanged("keywords"); },
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
    return {
        writeDlgContent: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            jt.out("topdlgdiv", jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "cfgp")
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["a", {href:"#configure", onclick:a.oc, title:a.tt},
                         ["span", {cla:"pathlabelspan"}, a.n + ": "]],
                        ["span", {cla:"pathspan"}, config[a.p]]]])],
                 ["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "info")
                  .map((a) =>
                      ["div", {cla:"pathdiv"}, mgrs.locla[a.htmlfs]()])],
                 ["div", {cla:"dlgbuttonsdiv"},
                  acts.filter((a) => a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", title:a.tt, onclick:a.oc},
                       a.n])]])); },
        hubSyncInfoHTML: function () {
            if(mgrs.locam.getAccount().dsId === "101") { return ""; }
            setTimeout(mgrs.a2h.makeStatusDisplay, 100);
            return jt.tac2html(["div", {id:"hubSyncInfoDiv"}]); }
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
                    getSpi().lastcheck = new Date().toISOString();
                    return mgrs.gen.updateAccount(
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
            jt.out("topdlgdiv", jt.tac2html(
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
            jt.out("topdlgdiv", jt.tac2html(
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
                return jt.out("topdlgdiv", "No songs on deck to export."); }
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
                        jt.out("topdlgdiv", msg); },
                    function (code, errtxt) {
                        stat("Marking songs played failed " + code + ": " +
                             errtxt); }); }
            else {  //not marking played
                jt.out("topdlgdiv", msg); } },
        notePlaylistWritten: function () {
            stat("Noting playlist written...", true);
            xpi.lastwrite = new Date().toISOString();
            xps.sp[xpi.name] = xpi;
            app.login.getAuth().settings.xps = xps;
            mgrs.gen.updateAccount(mgrs.webxp.markSongsPlayed,
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
                return jt.out("topdlgdiv", "No songs on deck to export."); }
            xps = app.login.getAuth().settings.xps || {};
            xps.sp = xps.sp || {};
            jt.out("topdlgdiv", jt.tac2html(
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
                    [["span", {id:"countspan"}, "Loading..."],
                     ["div", {id:"rtfmdiv"},
                      ["a", {href:"/docs/manual.html", title:"How Digger works",
                             onclick:"window.open('/docs/manual.html')" +
                             ";return false;"}, "RTFM"]]]],
                   ["div", {id:"titrightdiv"},
                    [["a", {href:"#database", title:"Library Actions",
                            onclick:mdfs("gen.togtopdlg", "la")},
                      ["img", {cla:"buttonico", src:"img/recordcrate.png"}]],
                     ["a", {href:"#copyplaylist", title:"Copy Deck To Playlist",
                            onclick:mdfs("gen.togtopdlg", "xp")},
                      ["img", {cla:"buttonico", src:"img/export.png"}]]]]]],
                 ["div", {id:"topdlgdiv", "data-mode":"empty"}],
                 ["div", {cla:"statdiv", id:"topstatdiv"}]])); },
        getAccount: function () {
            return mgrs[app.svc.hostDataManager() + "am"].getAccount(); },
        updateAccount: function (cf, ef) {
            mgrs[app.svc.hostDataManager() + "am"].updateAccount(cf, ef); },
        togtopdlg: function (mode, cmd) {
            var dlgdiv = jt.byId("topdlgdiv");
            if(cmd === "close" || (!cmd && dlgdiv.dataset.mode === mode)) {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {
                dlgdiv.dataset.mode = mode;
                mgrs[app.svc.hostDataManager() + mode].writeDlgContent(); } },
        initialDataLoaded: function () {
            mgrs[app.svc.hostDataManager() + "am"].initialDataLoaded(); },
        updateHubToggleSpan: function (acct) {
            jt.byId("hubtogspan").title = "Account Info (" +
                acct.diggerVersion + ", " + app.fileVersion() + ")";
            jt.out("hubtogspan", acct.firstname); }
    };  //end mgrs.gen returned functions
    }());


return {
    init: function () { mgrs.gen.initDisplay(); },
    initialDataLoaded: function () { mgrs.gen.initialDataLoaded(); },
    markIgnoreSongs: function () { mgrs.igf.markIgnoreSongs(); },
    rebuildKeywords: function () { mgrs.kwd.rebuildKeywords(); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.top, args); }
};  //end of module returned functions
}());
