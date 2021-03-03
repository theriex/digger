/*global app, jt */
/*jslint browser, white, fudge, long */

app.hub = (function () {
    "use strict";

    var hai = null;  //hub accounts info
    var curracct = null;  //current account in use


    function mdfs (mgrfname, ...args) {
        var pstr = app.paramstr(args);
        mgrfname = mgrfname.split(".");
        var fstr = "app.hub.managerDispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    }


    //General container for all managers, used for dispatch
    var mgrs = {};


    function makeFetchMergeProcessor (g) { return (function () {
        var guide = g;
        var logpre = "FMP " + guide.dsId + " ";
        var state = "stopped";
        var params = jt.objdata({email:curracct.email, at:curracct.token,
                                 aid:curracct.dsId, gid:guide.dsId});
        var pfs =
    { //processing functions
        procupd: function (msg) {
            mgrs.gin.fmpStatus(guide, msg); },
        noteUpdatedGuideInfo: function (updg) {
            guide = updg;
            pfs.procupd();  //reflect updated guide info in display
            var gidx = curracct.guides.findIndex((g) => g.dsId === guide.dsId);
            curracct[gidx] = guide; },
        fetch: function () {
            pfs.procupd("Fetching ratings...");
            jt.call("GET", "/guidedat?" + params, null,
                    function (updg) {  //updg has updated lastrating/lastcheck
                        pfs.noteUpdatedGuideInfo(updg);
                        pfs.merge(); },
                    function (code, errtxt) {
                        pfs.procupd("guidedat failed " + code + ": " + errtxt);
                        state = "stopped"; },
                    jt.semaphore("hub.fmp" + guide.dsId + ".fetch")); },
        merge: function () {
            pfs.procupd("Importing ratings...");
            jt.call("GET", "/ratimp?" + params, null,
                    function ([updg, dbo]) {
                        pfs.noteUpdatedGuideInfo(updg);
                        app.db.managerDispatch("lib", "rebuildSongData", dbo);
                        if(guide.lastcheck > guide.lastrating) { //done fetching
                            state = "stopped"; }
                        else {
                            pfs.fetch(); } },
                    function (code, errtxt) {
                        pfs.procupd("ratimp failed " + code + ": " + errtxt);
                        state = "stopped"; },
                    jt.semaphore("hub.fmp" + guide.dsId + ".merge")); }
    };  //end processing functions
    return {
        stop: function () {
            state = "stopped";
            jt.log(logpre + "stopped."); },
        start: function () {
            if(state !== "running") {
                state = "running";
                jt.log(logpre + " started.");
                pfs.fetch(); } }
    };  //end makeFetchMergeProcessor returned functions
    }()); }



    //General hub communication utilities
    mgrs.hcu = (function () {
        //account JSON fields
        var ajfs = {kwdefs:{cmp:["pos", "ig", "dsc"]},
                    igfolds:{}, settings:{},
                    guides:{cmp:["dsId", "email", "firstname", "hashtag"]}};
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
            var data = jt.objdata(acct);
            mgrs.hcu.deserializeAccount(acct);
            return data; },
        verifyDefaultAccountFields: function (acct) {
            var da = hai.accts.find((a) => a.dsId === "101");
            Object.keys(ajfs).forEach(function (df) {
                acct[df] = acct[df] || da[df] || ""; }); },
        equivField: function (fld, a, b) {  //compare deserialized objs
            if(fld && ajfs[fld] && ajfs[fld].cmp) {
                return ajfs[fld].cmp.every((f) => a[f] === b[f]); }
            return JSON.stringify(a[fld]) === JSON.stringify(b[fld]); },
        accountDisplayDiff: function (a, b) {
            if(!a || !b) { return false; }  //nothing to compare
            var changed = Object.keys(ajfs).find((fld) =>
                !mgrs.hcu.equivField(fld, a, b));
            return changed || false; },
        noteReturnedCurrentAccount: function (acct, token) {
            mgrs.hcu.deserializeAccount(acct);
            mgrs.hcu.verifyDefaultAccountFields(acct);
            acct.token = token;  //not included in returned data
            var changed = mgrs.hcu.accountDisplayDiff(curracct, acct);
            curracct = acct;
            hai.currid = acct.dsId;
            hai.accts = [acct,
                         ...hai.accts.filter((a) => a.dsId !== acct.dsId)];
            app.db.config().acctsinfo = hai;
            return changed; },
        noteUpdatedAccountsInfo: function (acctsinfo) {
            curracct = null;  //clear any stale ref
            hai = acctsinfo;
            if(!hai || !hai.currid) {
                throw("Bad acctsinfo"); }
            curracct = hai.accts.find((a) => a.dsId === hai.currid);
            if(!curracct) {
                throw("No current account found"); }
            jt.out("hubtogspan", curracct.firstname); }
    };  //end mgrs.hcu returned functions
    }());


    //The local manager handles changes to DiggerHub account info where the
    //change first needs to be reflected locally, then secondarily updated
    //at DiggerHub if a DiggerHub account has been set up.
    mgrs.loc = (function () {
        var tmo = null;  //sync timeout
        var upldsongs = null;
    return {
        init: function () {
            hai = null;
            curracct = null; },
        dataLoaded: function () {  //conf.acctsinfo verified server side
            mgrs.hcu.noteUpdatedAccountsInfo(app.db.config().acctsinfo);
            jt.log("dataLoaded curracct " + curracct.firstname);
            mgrs.loc.notifyAccountChanged(); },
        notifyAccountChanged: function (context) {
            if(!context || context === "keywords") {
                app.db.managerDispatch("kwd", "rebuildKeywords");
                app.player.managerDispatch("kwd", "rebuildToggles");
                app.filter.managerDispatch("btc", "rebuildControls"); }
            if(!context || context === "igfolders") {
                app.db.managerDispatch("igf", "redrawIgnoreFolders"); }
            if(!context || context === "settings") {
                app.filter.managerDispatch("stg", "rebuildAllControls"); } },
        updateAccount: function (contf, errf) {
            //the curracct data has already been updated by the caller
            //contf calls notifyAccountChanged if needed
            var data = jt.objdata({acctsinfo:JSON.stringify(hai)});
            jt.call("POST", "/acctsinfo", data,  //save to local server
                    function (acctsinfo) {
                        mgrs.hcu.noteUpdatedAccountsInfo(acctsinfo);
                        mgrs.loc.syncToHub();
                        if(contf) {
                            contf(acctsinfo); } },
                    function (code, errtxt) {
                        jt.log("hub.loc.updateAccount " + code + ": " + errtxt);
                        if(errf) {
                            errf(code, errtxt); } },
                    jt.semaphore("hub.loc.updateAccount")); },
        handleSyncError: function (code, errtxt) {
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.dlg.signOut(); }
            jt.log("syncToHub " + code + ": " + errtxt); },
        syncToHub: function () {
            if(!curracct || curracct.dsId === "101" || !curracct.token) {
                return; }  //invalid account or not set up yet
            if(tmo) {  //reset the sync timer if currently waiting
                clearTimeout(tmo); }
            tmo = setTimeout(function () {
                tmo = null;
                jt.out("modindspan", "hub");
                var data = mgrs.loc.makeSendSyncData();
                //see ../../docs/hubsyncNotes.txt
                jt.call("POST", "/hubsync", data,
                        function (updates) {
                            //leave the indicator light on while processing
                            //jt.out("modindspan", "");
                            mgrs.loc.processReceivedSyncData(updates); },
                        function (code, errtxt) {
                            jt.out("modindspan", "");
                            upldsongs = null;
                            mgrs.loc.handleSyncError(code, errtxt); },
                        jt.semaphore("loc.syncToHub")); },
                                20 * 1000); },
        makeSendSyncData: function () {
            //send the current account + any songs that need sync.  If just
            //signed in, then don't send the current song or anything else
            //until after the initial download sync.
            upldsongs = [];
            if(!curracct.syncsince) {  //not initial account creation
                upldsongs = Object.values(app.db.data().songs)
                    .filter((s) => s.lp > (s.modified || ""));
                upldsongs = upldsongs.slice(0, 199); }
            mgrs.hcu.serializeAccount(curracct);
            var obj = {email:curracct.email, token:curracct.token,
                       syncdata: JSON.stringify([curracct, ...upldsongs])};
            mgrs.hcu.deserializeAccount(curracct);
            return jt.objdata(obj); },
        processReceivedSyncData: function (updates) {
            //received account + any songs that need to be saved locally.
            //Similar logic on server has already written the data to disk,
            //so just need to reflect in current runtime.
            var changed = mgrs.hcu.noteReturnedCurrentAccount(updates[0],
                                                              curracct.token);
            if(changed) { //need to rebuild display with updated info
                mgrs.loc.notifyAccountChanged(); }
            var songs = updates.slice(1);
            jt.log("processReceivedSyncData " + songs.length + " songs.");
            songs.forEach(function (s) { app.db.noteUpdatedSongData(s); });
            jt.out("modindspan", "");
            if(curracct.syncsince && curracct.syncsince < curracct.modified) {
                mgrs.loc.syncToHub(); } }
    };  //end mgrs.loc returned functions
    }());


    //The dialog manager handles changes to DiggerHub account info where the
    //change first needs to take effect at DiggerHub, then be reflected
    //locally.  This is in contrast to things like settings which are
    //reflected first locally and then synchronized with DiggerHub.
    mgrs.dlg = (function () {
        //changing email requires prompting for a password to create a new
        //token. Leaving email as read-only for now.
        var mafs = [{n:"email", x:true},
                    {n:"firstname", d:"first name", p:"Name for display"},
                    {n:"hashtag", p:"Your unique user tag"},
                    {n:"guides", d:"guides", x:"guides"}];
    return {
        chooseAccount: function () {
            var ars = hai.accts.map((ai) =>
                ["tr",
                 [["td",
                   ["div", {cla:"dachoicediv"},
                    ["a", {href:"#" + ai.firstname,
                           onclick:mdfs("dlg.selectAccount", ai.dsId)},
                     ai.firstname]]],
                  ["td",
                   ["a", {href:"#remove",
                          onclick:mdfs("dlg.removeAccount", ai.dsId)},
                    ["img", {cla:"rowbuttonimg",
                             src:"img/trash.png"}]]]]]);
            ars.push(["tr",
                      ["td", {colspan:2},
                       ["div", {cla:"dachoicediv"},
                        ["a", {href:"#add",
                               onclick:mdfs("dlg.signInOrJoin")},
                         "Add Account"]]]]);
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"hubacctseldiv"},
                 ["table", ars]])); },
        selectAccount: function (aid) {
            hai.currid = aid;
            mgrs.hcu.noteUpdatedAccountsInfo(hai);
            mgrs.dlg.accountSettings(); },
        removeAccount: function (aid) {
            jt.out("dbstatdiv", "Removing account...");
            if(aid === hai.currid) {
                hai.currid = 0; }
            hai.accts = hai.accts.filter((a) => a.dsId !== aid);
            mgrs.loc.updateAccount(
                function (acctsinfo) {
                    jt.out("dbstatdiv", "");
                    mgrs.hcu.noteUpdatedAccountsInfo(acctsinfo); },
                    //Don't automatically displayAccountInfo, let them toggle
                    //the dialog open if they want.
                function (code, errtxt) {
                    jt.out("dbstatdiv", code + ": " + errtxt); }); },
        changePwdForm: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"siojfdiv"},
                 [["table",
                   ["tr",
                    [["td", {cla:"formattr"}, "new password"],
                     ["td", ["input", {type:"password", id:"pwdin"}]]]]],
                  ["div", {id:"chgpwdstatdiv"}],
                  ["div", {id:"chgpwdbuttonsdiv", cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"chgpwdb",
                               onclick:mdfs("dlg.changePassword")},
                    "Change Password"]]]])); },
        changePassword: function () {
            jt.byId("chgpwdb").disabled = true;
            curracct.updemail = curracct.email;
            curracct.updpassword = jt.byId("pwdin").value;
            mgrs.dlg.updateHubAccount(
                function () {
                    delete curracct.updemail;
                    delete curracct.updpassword;
                    mgrs.dlg.accountSettings(); },
                function (code, errtxt) {
                    jt.byId("chgpwdb").disabled = false;
                    jt.out("chgpwdstatdiv", code + ": " + errtxt); }); },
        signOut: function () {
            mgrs.dlg.removeAccount(curracct.dsId); },
        acctTopActionsHTML: function () {
            var tas = [
                {h:"#switch", oc:"dlg.chooseAccount", t:"switch accounts"},
                {h:"#chgpwd", oc:"dlg.changePwdForm", t:"change password"},
                {h:"#signout", oc:"dlg.signOut", t:"sign out"}];
            return jt.tac2html(
                ["div", {id:"hubaccttopdiv"},
                 tas.map((ta) =>
                     jt.tac2html(["a", {href:ta.h, onclick:mdfs(ta.oc)}, ta.t]))
                 .join(" &nbsp;|&nbsp ")]); },
        inputOrDispText: function (fd) {
            if(fd.x) { 
                var value = curracct[fd.n];
                if(fd.x === "guides") {
                    value = mgrs.gin.accountFormDisplayValue(); }
                return ["span", {cla:"formvalspan"}, value]; }
            return ["input", {type:"text", id:fd.n + "in",
                              placeholder:fd.p || "", value:curracct[fd.n]}]; },
        acctFieldsHTML: function () {
            return jt.tac2html(
                ["div", {id:"hubacctfldsdiv"},
                 [["table",
                   mafs.map((fd) =>
                       ["tr",
                        [["td", {cla:"formattr"}, fd.d || fd.n],
                         ["td", mgrs.dlg.inputOrDispText(fd)]]])],
                  ["div", {id:"accupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"acctfldsupdb",
                               onclick:mdfs("dlg.updAcctFlds")},
                    "Update Account"]]]]); },
        updAcctFlds: function () {
            jt.out("accupdstatdiv", "");  //clear any previous message
            var changed = false;
            mafs.forEach(function (fd) {
                if(!fd.x) { //not disabled input
                    var val = jt.byId(fd.n + "in").value.trim();
                    if(val !== curracct[fd.n]) {
                        changed = true;
                        curracct[fd.n] = val; }} });
            if(changed) {
                mgrs.dlg.updateHubAccount(
                    function () {
                        jt.out("accupdstatdiv", "Account updated."); },
                    function (code, errtxt) {
                        jt.out("accupdstatdiv", code + ": " + errtxt); }); } },
        updateHubAccount: function (contf, errf) {
            //the curracct data has already been updated by the caller
            jt.call("POST", "/updacc", mgrs.hcu.accountAsData(curracct),
                    function (accntok) {
                        mgrs.dlg.writeUpdAcctToAccounts(accntok);
                        if(contf) {
                            contf(accntok); } },
                    function (code, errtxt) {
                        jt.log("hub.dlg.updateHubAccount " + code + ": " +
                               errtxt);
                        if(errf) {
                            errf(code, errtxt); } },
                    jt.semaphore("hub.dlg.updateHubAccount")); },
        writeUpdAcctToAccounts: function (accntok, contf, errf) {
            mgrs.hcu.noteReturnedCurrentAccount(accntok[0], accntok[1]);
            mgrs.loc.updateAccount(
                function (acctsinfo) {
                    mgrs.hcu.noteUpdatedAccountsInfo(acctsinfo);
                    if(contf) {
                        contf(acctsinfo); } },
                function (code, errtxt) {
                    jt.log("writeUpdAcctToAccounts " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        accountSettings: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                [mgrs.dlg.acctTopActionsHTML(),
                 mgrs.dlg.acctFieldsHTML()])); },
        showSignInJoinForm: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"siojfdiv"},
                 [["table",
                   [["tr", {id:"firstnamerow", style:"display:none;"},
                     [["td", {cla:"formattr"}, "first name"],
                      ["td", ["input", {type:"text", id:"firstnamein",
                                        placeholder:"UI display name"}]]]],
                    ["tr",
                     [["td", {cla:"formattr"}, "email"],
                      ["td", ["input", {type:"email", id:"emailin",
                                        placeholder:"nospam@example.com"}]]]],
                    ["tr",
                     [["td", {cla:"formattr"}, "password"],
                      ["td", ["input", {type:"password", id:"pwdin"}]]]],
                    ["tr",
                     ["td", {colspan:2},
                      [["input", {type:"checkbox", id:"siotcb", checked:true,
                                  onclick:mdfs("dlg.togsioj", "event")}],
                       ["label", {fo:"siotcb", cla:"cblab"},
                        "Create new hub account"]]]]]],
                  ["div", {id:"siojstatdiv"}],
                  ["div", {id:"siojerrhelpdiv"}],
                  ["div", {id:"siojbuttonsdiv", cla:"dlgbuttonsdiv"}]]]));
            mgrs.dlg.togsioj(); },
        togsioj: function () {
            var signinb = jt.byId("signinb");
            var newacctb = jt.byId("newacctb");
            if(signinb || (!signinb && !newacctb)) {
                jt.byId("firstnamerow").style.display = "table-row";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"newacctb",
                                onclick:mdfs("dlg.signInOrJoin", "newacct")},
                     "Create Account"])); }
            else {
                jt.byId("firstnamerow").style.display = "none";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"signinb",
                                onclick:mdfs("dlg.signInOrJoin", "acctok")},
                     "Sign In"])); } },
        siojbDisable: function (disabled) {
            var bids = ["newacctb", "signinb"];
            bids.forEach(function (bid) {
                if(jt.byId(bid)) {
                    jt.byId(bid).disabled = disabled; } }); },
        siojErrHelp: function (errtxt) {
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                jt.out("siojerrhelpdiv", jt.tac2html(
                    ["a", {href:"#pwdreset", title:"Send password reset email",
                           onclick:mdfs("dlg.emailPwdReset")},
                     "Send password reset"])); } },
        emailPwdReset: function () {
            jt.out("siojerrhelpdiv", "");
            var data = jt.objdata({email:jt.byId("emailin").value});
            jt.call("GET", "/mailpwr?" + data, null,
                    function () {
                        jt.out("siojstatdiv", "Reset password link sent."); },
                    function (code, errtxt) {
                        jt.out("siojstatdiv", "Reset failed " + code + ": " +
                               errtxt); },
                    jt.semaphore("hub.dlg.emailPwdReset")); },
        signInOrJoin: function (endpoint) {
            curracct = null;
            if(!jt.byId("siojfdiv")) {  //form not displayed yet
                return mgrs.dlg.showSignInJoinForm(); }
            mgrs.dlg.siojbDisable(true);
            var data = jt.objdata(
                {email:jt.byId("emailin").value,
                 password:jt.byId("pwdin").value,
                 firstname:jt.byId("firstnamein").value});
            var errf = function (code, errtxt) {
                mgrs.dlg.siojbDisable(false);
                jt.out("siojstatdiv", code + ": " + errtxt);
                mgrs.dlg.siojErrHelp(errtxt); };
            jt.call("POST", "/" + endpoint, data,  // /newacct or /acctok
                    function (accntok) {
                        accntok[0].syncsince = accntok[0].created + ";1";
                        mgrs.dlg.writeUpdAcctToAccounts(accntok,
                            function () {
                                mgrs.loc.syncToHub();
                                mgrs.dlg.accountSettings(); },
                            errf); },
                    errf,
                    jt.semaphore("dlg.signInOrJoin")); },
        displayAccountInfo: function () {
            if(!hai || !hai.accts.length ||
               (hai.accts.length === 1 && hai.accts[0].dsId === "101")) {
                mgrs.dlg.signInOrJoin(); }
            else {  //have acctsinfo with at least one real account
                if(hai.currid) {
                    curracct = hai.accts.find((a) => a.dsId === hai.currid); }
                if(curracct) {
                    mgrs.dlg.accountSettings(); }
                else {  //choose from existing accounts or add new
                    mgrs.dlg.chooseAccount(); } } }
    };  //end mgrs.dlg returned functions
    }());


    //The guide input manager handles adding/removing guides and getting
    //input from them for songs that have not been rated yet.
    mgrs.gin = (function () {
        var gdesc = "Add a fellow digger to help fill unrated songs in your library";
        var cg = null;   //current guide being displayed
        var gdmps = {};  //instantiated guide data merge processors
    return {
        accountFormDisplayValue: function () {
            var html = [];
            curracct.guides = curracct.guides || [];
            curracct.guides.forEach(function (g, idx) {
                html.push([["a", {href:"#digger" + g.dsId,
                                  title:"View details for " + g.email,
                                  onclick:mdfs("gin.showGuide", idx)},
                            g.firstname],
                           ["span", {cla:"sepcomspan"}, ","]]); });
            html.push(["a", {href:"#addguide", title:gdesc,
                             onclick:mdfs("gin.addGuideDialog")},
                       "add guide"]);
            return jt.tac2html(["span", {cla:"guidelinksspan"}, html]); },
        addGuideDialog: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"guidedlgdiv"},
                 [["table",
                   [["tr",
                     ["td", {colspan:2}, "Get help with unrated songs"]],
                    ["tr",
                     [["td", {cla:"formattr"}, "email"],
                      ["td", ["input", {type:"email", id:"emailin",
                                        placeholder:"friend@example.com"}]]]]]],
                  ["div", {id:"amgstatdiv"}],
                  ["div", {id:"amgbuttonsdiv", cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"addguideb",
                               onclick:mdfs("gin.processGuideAdd")},
                    "Add Guide"]]]])); },
        verifyGuideEmail: function (emaddr) {
            var okgem = {email:emaddr, err:""};
            if(!jt.isProbablyEmail(okgem.email)) {
                okgem.err = "Digger email address required."; }
            okgem.email = okgem.email.trim().toLowerCase();
            if(okgem.email === curracct.email) {
                okgem.err = "A guide is someone other than you."; }
            else if(curracct.guides &&
                    curracct.guides.find((g) => g.email === okgem.email)) {
                okgem.err = okgem.email + " is already a guide."; }
            return okgem; },
        processGuideAdd: function () {
            jt.out("amgstatdiv", "");
            var okgem = mgrs.gin.verifyGuideEmail(jt.byId("emailin").value);
            if(okgem.err) {
                return jt.out("amgstatdiv", okgem.err); }
            jt.byId("addguideb").disabled = true;
            var data = jt.objdata({email:curracct.email, at:curracct.token,
                                   gmaddr:okgem.email});
            jt.call("POST", "/addguide", data,
                    function (accts) {
                        mgrs.hcu.noteReturnedCurrentAccount(accts[0],
                                                            curracct.token);
                        mgrs.gin.showGuide(0); },
                    function (code, errtxt) {
                        jt.byId("addguideb").disabled = false;
                        jt.out("amgstatdiv", code + ": " + errtxt); },
                    jt.semaphore("hub.gin.processGuideAdd")); },
        showGuide: function (gidx) {
            cg = curracct.guides[gidx];
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"guidedlgdiv"},
                 [["div",
                   [["span", {id:"guidelabelspan"}, "Guide: "],
                    ["span", {id:"guideinfospan"},
                     [["span", {id:"guideinfonamespan"},
                       ["a", {href:"#playlist",
                              title:"Show " + cg.firstname + "'s playlist",
                              onclick:mdfs("gin.showPlaylist",
                                           (cg.hashtag || cg.dsId))},
                        cg.firstname]],
                      " (",
                      ["a", {href:"mailto:" + cg.email}, cg.email], ")"]]]],
                  ["div", {id:"cgsongcountdiv", cla:"cblab"}],
                  ["div", {id:"cglastcheckdiv", cla:"cblab"}],
                  ["div", {id:"cgfilleddiv", cla:"cblab"}],
                  ["div", {id:"guidestatdiv"}],
                  ["div", {id:"guidebuttonsdiv", cla:"dlgbuttonsdiv"},
                   [["a", {href:"#remove", style:"margin:0px 10px 0px 0px",
                           title:"Remove " + cg.firstname + " from guides.",
                           onclick:mdfs("gin.removeGuide", gidx)},
                     ["img", {cla:"rowbuttonimg",
                              src:"img/trash.png"}]],
                   ["button", {type:"button", id:"gratb",
                               onclick:mdfs("gin.startFetchMerge", gidx)},
                    "Check For Ratings"]]]]]));
            mgrs.gin.refreshGuideDisplay();
            mgrs.gin.startFetchMerge(); },
        refreshGuideDisplay: function () {
            var dispchecked = "never";
            if(cg.lastcheck) {
                dispchecked = jt.tz2human(cg.lastcheck); }
            jt.out("cgsongcountdiv", (cg.songcount || 0) + " songs");
            jt.out("cglastcheckdiv", "last checked: " + dispchecked);
            jt.out("cgfilleddiv", (cg.filled || 0) + " ratings contributed.");
            jt.byId("gratb").disabled = false;
            jt.out("guidestatdiv", ""); },
        startFetchMerge: function () {
            if(!gdmps[cg.dsId]) {
                gdmps[cg.dsId] = makeFetchMergeProcessor(cg); }
            gdmps[cg.dsId].start(); },
        fmpStatus: function (guide, msg) {
            if(cg && cg.dsId === guide.dsId) {
                cg = guide;
                mgrs.gin.refreshGuideDisplay();
                jt.out("guidestatdiv", msg || ""); } },
        showPlaylist: function (ident) {  //hashtag or id
            //open a new window for https://diggerhub.com/playlist/ident
            jt.err("playlist/" + ident + " not available at server yet"); },
        removeGuide: function (gidx) {
            var remg = curracct.guides[gidx];
            jt.out("guidestatdiv", "Removing " + remg.firstname + "...");
            if(gdmps[remg.dsId]) { gdmps[remg.dsId].stop(); }
            curracct.guides.splice(gidx, 1);
            mgrs.dlg.updateHubAccount(
                function () {
                    mgrs.dlg.accountSettings(); },
                function (code, errtxt) {
                    jt.out("guidestatdiv", "Remove failed " + code + ": " +
                           errtxt); }); }
    };  //end mgrs.gin returned functions
    }());


    function titleHTML () {
        return jt.tac2html(
            ["a", {href:"#DiggerHub", onclick:jt.fs("app.hub.toggle()")},
             ["span", {id:"hubtogspan", cla:"titlespan"}, "Digger"]]);
    }


    function toggleHubDialog () {
        var dlgdiv = jt.byId("dbdlgdiv");
        if(dlgdiv.dataset.mode === "hub") {  //currently displaying hub dlg
            dlgdiv.dataset.mode = "empty";
            dlgdiv.innerHTML = ""; }
        else {
            dlgdiv.dataset.mode = "hub";
            mgrs.dlg.displayAccountInfo(); }
    }


return {
    init: function () { mgrs.loc.init(); },
    dataLoaded: function () { mgrs.loc.dataLoaded(); },
    curracct: function () { return curracct; },
    titleHTML: function () { return titleHTML(); },
    toggle: function () { toggleHubDialog(); },
    managerDispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.hub, args); }
};  //end of returned functions
}());
