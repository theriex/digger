/*global app, jt, Spotify */
/*jslint browser, white, for, long, unordered */

app.player = (function () {
    "use strict";

    var pmso = {  //player module state object  (runtime only, not persistent)
        state:"",     //"playing", "paused", "ended"
        song:null,    //currently playing song object
        drsm:"",      //data receive state mode 
        prevst:null,  //previously received playback status
        currst:null,  //current received playback status
        mrscnts:""};  //most recent song change notice timestamp
    var ctrls = {};   //module level container for UI control elements
    const mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.util.dfs("player", mgrfname, args);
    }

    ////////////////////////////////////////
    // Song data changes
    ////////////////////////////////////////

    //The song change manager handles persistence of song data updates.
    //Control movements can trigger a lot of changes in rapid succession so
    //updates are queued, and multiple pending updates from the same calling
    //source are collapsed to write only the most recent.  The result is a
    //keyword activation gets written immediately, and fine tuning a knob
    //position won't overload peristence processing even if it causes
    //numerous writeDigDat calls.
    mgrs.scm = (function () {
        const savesrcidstr = "player.saveSongRatingChange";
        function digDatUpdated (digdat, source) {
            //app write timestamp >= most recent song change notice timestamp
            if(!pmso.expecting && pmso.song && digdat.awts >= pmso.mrscnts) {
                const ddsong = digdat.songs[pmso.song.path];
                //If UI displayed song is more recently modified, don't revert
                if(pmso.song.lp <= ddsong.lp) {
                    pmso.song = ddsong;
                    mgrs.uiu.updateSongDisplay("digDatUpdated"); }
                //note write completed
                setTimeout(function () {  //let listener callbacks finish
                    if(source === savesrcidstr) {
                        clearICVSTimeout("CompletedWrite"); }
                    else {  //write was from some other operation
                        clearICVSTimeout("OtherSave"); } }, 100); } }
        function clearICVSTimeout (reason) {
            const logpre = "clearICVSTimeout " + reason + " ";
            jt.out("modindspan", "");
            if(!pmso.icvs || !pmso.icvs.tmo) { return; }
            if(pmso.icvs.tmo) {
                clearTimeout(pmso.icvs.tmo);
                pmso.icvs.tmo = null; }
            //The previously pending write should not go ahead if the song
            //has changed because it's better to drop last second click
            //adjustments than have (possibly erroneuous) post-play changes
            //to a song rating that is no longer visible.
            if(reason === "SongChanged" ||
                   (pmso.song && pmso.icvs.svcpy &&
                    pmso.song.path !== pmso.icvs.svcpy.path)) {
                jt.log(logpre + "prev pending save dropped " +  pmso.icvs.cid);
                pmso.icvs = null; }
            //OtherSave is pretty much from hubsync. It is better UX to save
            //what is in the UI rather than reverting it to what was pulled
            //from the hub.  If the song is unrated, then hubsync will have
            //already updated the local display, and no pending save since
            //no control adjustment.  "Expired" or "CompletedWrite" means
            //continue with the next pending save.
            else {
                if(pmso.icvs.svcpy) {  //have pending save waiting
                    jt.log(logpre + "handle pending save " + pmso.icvs.cid);
                    app.util.copyUpdatedSongData(pmso.song, pmso.icvs.svcpy);
                    pmso.icvs.svcpy = null;
                    pmso.song.lp = new Date().toISOString();
                    saveSongRatingChange(pmso.icvs.cid); }
                else {
                    jt.log(logpre + "no pending save"); } } }
        function saveSongRatingChange (cid) {
            const logpre = "saveSongRatingChange " + cid + " ";
            jt.out("modindspan", "mod");
            pmso.icvs = pmso.icvs || {};  //impression control values save
            pmso.icvs.cid = cid;  //debug confirmation of latest save source
            if(pmso.icvs.tmo) {  //still waiting for previous save
                pmso.icvs.svcpy = JSON.parse(JSON.stringify(pmso.song));
                jt.log(logpre + "save pending ongoing write");
                return; }
            jt.log(logpre + "writing song");
            pmso.icvs.tmo = setTimeout(function () {
                clearICVSTimeout("Expired"); }, 10*1000);
            app.pdat.writeDigDat(savesrcidstr); }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("player.scm", digDatUpdated); },
        changeCurrentlyPlayingSong: function (song, state) {
            pmso.song = app.pdat.songsDict()[song.path];
            clearICVSTimeout("SongChange");
            pmso.state = state || "";
            mgrs.uiu.updateSongDisplay("scm.changeCurrentlyPlayingSong");
            mgrs.slp.notePlayerStateChange();
            if(state !== "ended") {
                app.deck.currentlyPlayingSongChanged(); } },
        noteSongModified: function (cid) {  //caller Id string
            if(!pmso.song) { return; }  //ignore any pre-playing control noise
            //song.lp/pc already updated when song played, but an interim hub
            //sync could leave modified > lp preventing resync.  Refresh lp.
            pmso.song.lp = new Date().toISOString();
            saveSongRatingChange(cid); }
    };  //end mgrs.scm returned functions
    }());


    //The rating manager handles rating stars display and input
    mgrs.rat = (function () {
        const imgw = 110;       //scaled width of 5 stars image
        const imgh = 22;        //scaled height of 5 stars image
        const stw = imgw / 5;   //width of one star
        function adjustRatingFromPosition (x, ignore /*y*/, pa) {
            //jt.log("adjustRatingFromPosition x: " + x + ", pa: " + pa);
            if(pa) {
                const nrv = Math.round((x / stw) * 2);
                const psw = Math.round((nrv * stw) / 2);
                jt.byId("playerstarseldiv").style.width = psw + "px";
                if(pmso.song && pa !== "reflectonly") {
                    const cv = pmso.song.rv;
                    pmso.song.rv = nrv;
                    if(cv !== pmso.song.rv) {
                        mgrs.scm.noteSongModified("rat"); } } } }
        function initControlsTargetObject () {
            pmso.resetPlaceholderControlObject = function () {
                pmso.placo = {el:49, al:49, kws:"", rv:5, fq:"", nt:""}; };
            pmso.cto = function () {
                if(pmso.song) { return pmso.song; }
                return pmso.placo; };
            pmso.resetPlaceholderControlObject(); }
    return {
        initialize: function () {
            initControlsTargetObject();
            const starstyle = "width:" + imgw + "px;height:" + imgh + "px;";
            jt.out("rvdiv", jt.tac2html(
                ["div", {cla:"ratstarscontainerdiv", style:starstyle},
                 ["div", {cla:"ratstarsanchordiv"},
                  [["div", {cla:"ratstarbgdiv"},
                    ["img", {src:"img/stars425x86g.png", style:starstyle}]],
                   ["div", {cla:"ratstarseldiv", id:"playerstarseldiv"},
                    ["img", {src:"img/stars425x86.png", style:starstyle}]],
                   ["div", {id:"ratstardragdiv", style:starstyle}]]]]));
            ctrls.rat = {stat:{pointingActive:false,
                               maxxlim:imgw, roundpcnt:5}};
            app.filter.movelisten("ratstardragdiv", ctrls.rat.stat,
                                  adjustRatingFromPosition);
            adjustRatingFromPosition(0, 0, "reflectonly"); },  //init empty
        adjustPositionFromRating: function (rv) {
            if(typeof rv !== "number") {
                jt.log("player.rat.adjustPositionFromRating non-numeric rv");
                rv = 0; }
            adjustRatingFromPosition(Math.round((rv * stw) / 2),
                                     0, "relectonly"); }
    };  //end mgrs.rat returned functions
    }());


    //Pan drag indicator manager handles drag decoration for the pan controls
    mgrs.pdi = (function () {
        function verifySVG (cid) {
            const sid = cid + "svg";
            if(jt.byId(sid)) { return true; }  //already set up. done.
            jt.out(cid + "panddecdiv", jt.tac2html(
                ["svg", {id:sid, xmlns:"http://www.w3.org/2000/svg",
                         viewBox:"0 0 100 100", "stroke-width":3,
                         stroke:"#ffab00", fill:"#ffab00"},
                 [["line", {id:sid + "tl", x1:50, y1:3, x2:50, y2:35}],
                  ["path", {d:"M50 3 L55 8 L45 8 Z"}],
                  ["line", {id:sid + "bl", x1:50, y1:55, x2:50, y2:97}],
                  ["path", {d:"M50 97 L55 92 L45 92 Z"}]]])); }
    return {
        showDragIndicators: function (cid) {
            verifySVG(cid);
            jt.byId(cid + "svg").style.display = "block"; },
        hideDragIndicators: function (cid) {
            verifySVG(cid);
            jt.byId(cid + "svg").style.display = "none"; }
    };  //end of mgrs.pdi returned functions
    }());


    //handle the pan controls for energy and approachability
    mgrs.pan = (function () {
        const drag = {active:false, val:0};
        const anglemax = 145;  //max knob rotation
        const cmso = 14;  //click move knob spacing offsset
        const kcph = 40;  //knob control panel height
        function balanceLabels () {
            const ids = ["alpanlld", "alpanrld", "elpanlld", "elpanrld"];
            const els = ids.map((i) => jt.byId(i));
            const wds = els.map((e) => e? e.offsetWidth : 0);
            //Hardcoded minimum width avoids overpacking and balances if space.
            const mw = Math.max(48, Math.max.apply(null, wds));
            els.forEach(function (e) {
                if(e) {
                    e.style.width = mw + "px"; } }); }
        function packControlWidthwise (id) {
            balanceLabels();
            const pk = {leftlab:{elem:jt.byId(id + "panlld")},
                        rightlab:{elem:jt.byId(id + "panrld")},
                        surr:{elem:jt.byId(id + "pansurrbgd")},
                        lpdl:{elem:jt.byId(id + "panlpd")},
                        rpdl:{elem:jt.byId(id + "panrpd")},
                        panbg:{elem:jt.byId(id + "panbgdiv")},
                        panface:{elem:jt.byId(id + "panfacediv")}};
            Object.keys(pk).forEach(function (key) {
                pk[key].bbox = pk[key].elem.getBoundingClientRect(); });
            const left = 8 + pk.leftlab.bbox.width;
            pk.panbg.elem.style.left = left + "px";
            pk.panface.elem.style.left = left + "px";
            pk.surr.elem.style.left = (left - cmso) + "px";
            pk.surr.elem.style.width = (kcph + (2 * cmso)) + "px";
            pk.lpdl.elem.style.width = left + 22 + "px";
            pk.rpdl.elem.style.width = (pk.rightlab.bbox.width + 5 + 22) + "px";
            pk.lpdl.elem.style.height = kcph + "px";
            pk.rpdl.elem.style.height = kcph + "px";
            ctrls[id].width = left + 44 + pk.rightlab.bbox.width + 5;
            const pds = ["pancontdiv", "pandiv", "panddecdiv", "pandragdiv"];
            pds.forEach(function (panelid) {
                const panel = jt.byId(id + panelid);
                panel.style.width = ctrls[id].width + "px";
                panel.style.height = kcph + "px"; });
            //jt.log(id + "pandragdiv width: " + ctrls[id].width);
            ctrls[id].knog = {x:pk.panbg.elem.offsetLeft + 21, //viz elem calc
                              y:Math.floor(ctrls[id].width / 2) + 2}; }
        function positionDragOverlay (id) {
            const pk = {pots:jt.byId("panpotsdiv"),
                        pan:jt.byId(id + "pandiv"),
                        drag:jt.byId(id + "pandragdiv")};
            const leftpad = parseInt(
                window.getComputedStyle(pk.pots)
                    .getPropertyValue("padding-left"), 10);
            const dragdims = {top:0,  //relative to impressiondiv
                              left:pk.pan.offsetLeft - leftpad,
                              width:pk.pan.offsetWidth,
                              height:pk.pan.offsetHeight};
            Object.entries(dragdims).forEach(function ([k, v]) {
                pk.drag.style[k] = v + "px"; }); }
        function valueRangeConstrain (v) {
            v = Math.max(v, 0);
            v = Math.min(v, 99);
            return v; }
        function setTLHW (elem, dim) {
            if(dim.t !== undefined) {
                elem.style.top = dim.t + "px"; }
            if(dim.l !== undefined) {
                elem.style.left = dim.l + "px"; }
            if(dim.h !== undefined) {
                elem.style.height = dim.h + "px"; }
            if(dim.w !== undefined) {
                elem.style.width = dim.w + "px"; } }
        function updateValueByClick (id, x/*, y*/) {
            var val = pmso.cto()[id];
            if(ctrls[id].eventType === "dblclick") {
                if(val !== 49) {
                    mgrs.pan.updateControl(id, 49); }
                return; }
            const cfms = 400;  //paddle click fade milliseconds
            const kf = jt.byId(id + "panfacediv");
            if(x < kf.offsetLeft - cmso) {
                mgrs.uiu.illuminateAndFade(id + "panlpd", cfms);
                val -= 1; }
            else if(x > kf.offsetLeft + kf.offsetWidth + cmso) {
                mgrs.uiu.illuminateAndFade(id + "panrpd", cfms);
                val += 1; }
            val = valueRangeConstrain(val);
            if(val !== pmso.cto()[id]) {  //value has changed
                mgrs.pan.updateControl(id, val); } }
        function activateDragArea (id) {
            drag.active = true;
            const pc = ctrls[id];
            const drgdiv = jt.byId(id + "pandragdiv");
            mgrs.pdi.showDragIndicators(id);
            pc.maxxlim = pc.width;  //width from packControlWidthwise
            pc.maxylim = pc.width;  //make square, then adjust top offset
            pc.toplift = Math.round((pc.maxylim - kcph) / -2);
            setTLHW(drgdiv, {t:pc.toplift, h:pc.maxylim});
            setTLHW(jt.byId(id + "panddecdiv"), {t:pc.toplift, h:pc.maxylim}); }
        function deactivateDragArea (id) {
            if(!drag.active) {  //already deactivated, do not send any spurious
                return; }       //control updates.
            drag.active = false;
            mgrs.pan.updateControl(id, drag.val);
            const drgdiv = jt.byId(id + "pandragdiv");
            mgrs.pdi.hideDragIndicators(id);
            setTLHW(drgdiv, {t:0, h:kcph});
            setTLHW(jt.byId(id + "panddecdiv"), {t:0, h:kcph}); }
        function updateValueByDragCoordinates (id, ignore/*x*/, y) {
            var val = 49;
            const pc = ctrls[id];
            const vpad = pc.maxylim / 10;  //reserve 10% at top/bottom for drag
            const ath = pc.maxylim - (2 * vpad);  //active tracking height
            y -= vpad;  //remove bottom pad area from working y value
            y = Math.max(0, y);
            y = Math.min(ath, y);
            const yp = (y / ath) * 100;  //y as percentage of height
            const iyp = 100 - yp;  //invert so 0 at bottom and 100 at top
            val = Math.round((iyp / 100) * 99);  //convert pcnt to 0-99 range
            if(val !== pmso.cto()[id]) {  //value has changed
                mgrs.pan.updateControl(id, val); } }
        function handleClickMove (id, x, y, pa) {
            if(ctrls[id].eventType.indexOf("click") >= 0) {
                if(!pa) {  //two click notices per click, choosing non-pa one
                    if(!ctrls[id].dc.dragged) {  //value not changed by dragging
                        //jt.log(ctrls[id].eventType + " x:" + x + ", y:" + y);
                        updateValueByClick(id, x, y); } } }
            else {  //not a click event
                if(pa) {  //pointing active, mouse is down
                    if(ctrls[id].dc.status === "inactive") {
                        activateDragArea(id);
                        ctrls[id].dc.dragged = false;
                        ctrls[id].dc.status = "active"; }
                    else { //ctrls[id].dc.status === "active"
                        updateValueByDragCoordinates(id, x, y);
                        ctrls[id].dc.dragged = true; } }
                else {  //not pointing, mouse is up
                    deactivateDragArea(id);
                    ctrls[id].dc.status = "inactive"; } } }
        function activateControl (id) {
            ctrls[id].dc = {status:"inactive", dragged:"false"};
            ctrls[id].posf = function (x, y, pa) {
                handleClickMove(id, x, y, pa); };
            //double click reset not strictly necessary, and tends to
            //interfere with fat finger paddle controls on phone.
            // jt.on(jt.byId(id + "pandragdiv"), "dblclick", function (ignore) {
            //     mgrs.pan.updateControl(ctrls[id].fld, 49); });
            app.filter.movelisten(id + "pandragdiv",
                                  ctrls[id], ctrls[id].posf); }
        function createControl (id, det) {
            var pc = {fld:det.fld, pn:det.pn, low:det.low, high:det.high,
                      pointingActive:false, roundpcnt:3};  //maxxlim set in pack
            ctrls[id] = pc;
            jt.out(id + "pandiv", jt.tac2html(
              ["div", {cla:"pancontdiv", id:pc.fld + "pancontdiv"},
               [["div", {cla:"panleftpaddlediv", id:pc.fld + "panlpd"}],
                ["div", {cla:"panrightpaddlediv", id:pc.fld + "panrpd"}],
                ["div", {cla:"panddecdiv", id:pc.fld + "panddecdiv"}],
                ["div", {cla:"pansurrbgdiv", id:pc.fld + "pansurrbgd"}],
                ["div", {cla:"panleftlabdiv", id:pc.fld + "panlld"}, pc.low],
                ["div", {cla:"panrightlabdiv", id:pc.fld + "panrld"}, pc.high],
                ["div", {cla:"panfacediv", id:pc.fld + "panfacediv"},
                 ["img", {cla:"panfaceimg invlow", src:"img/panface.png"}]],
                ["div", {cla:"panbgdiv", id:pc.fld + "panbgdiv"},
                 ["img", {cla:"panbackimg", src:"img/panback.png"}]]]]));
            packControlWidthwise(id);
            positionDragOverlay(id);
            activateControl(id); }
        function hex2RGB (hexcolor) {
            var hcs = hexcolor.match(/\S\S/g);
            return {r:parseInt(hcs[0], 16),
                    g:parseInt(hcs[1], 16),
                    b:parseInt(hcs[2], 16)}; }
        function updateTitle (id, songtitle) {
            var title = "Dial-In " + ctrls[id].pn;
            if(songtitle) {
                title += " for " + songtitle; }
            const div = jt.byId(id + "pandiv");
            if(div) {
                div.title = title; } }
    return {
        initialize: function () {
            var filters = app.filter.filters();
            createControl("al", filters[0]);
            createControl("el", filters[1]);
            mgrs.pan.updateControl("al");
            mgrs.pan.updateControl("el");
            jt.on("impressiondiv", "mousedown", function (event) {
                const okinids = ["kwdin", "sleepcountsel", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //ignore to avoid selecting ctrls
            jt.on("impressiondiv", "mouseup", function (event) {
                ctrls.al.pointingActive = false;
                ctrls.el.pointingActive = false;
                ctrls.rat.pointingActive = false;
                const okinids = ["kwdin", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //don't update coords
            jt.on("panplaymousingdiv", "mouseup", function (ignore /*event*/) {
                //do not capture this event or Safari audio will capture the
                //downclick on the position indicator and never let go.
                ctrls.al.pointingActive = false;
                ctrls.el.pointingActive = false;
                ctrls.rat.pointingActive = false; }); },
        updateControl: function (id, val) {
            if(!val && val !== 0) {
                val = 49; }
            if(typeof val === "string") {
                val = parseInt(val, 10); }
            const target = pmso.cto();
            if(target[id] !== val) {
                if(drag.active) {
                    drag.val = val; }
                else {  //drag finished or reacting to click
                    target[id] = val;
                    if(pmso.song) {
                        updateTitle(id, pmso.song.ti);
                        mgrs.scm.noteSongModified("pan"); } } }
            //set knob face color from gradient
            const gra = app.filter.gradient();
            const grd = {f:hex2RGB(gra.left),
                         t:hex2RGB(gra.right)};
            const pct = (val + 1) / 100;
            const res = {r:0, g:0, b:0};
            Object.keys(res).forEach(function (key) {
                res[key] = Math.round(
                    grd.f[key] + (grd.t[key] - grd.f[key]) * pct); });
            const pfd = jt.byId(id + "panfacediv");
            pfd.style.backgroundColor = "rgb(" + 
                res.r + ", " + res.g + ", " + res.b + ")";
            //rotate knob to value
            const rot = Math.round(2 * anglemax * pct) - anglemax;
            pfd.style.transform = "rotate(" + rot + "deg)"; }
    };  //end mgrs.pan returned functions
    }());


    //handle the selected keywords display and entry
    mgrs.kwd = (function () {
        var kwdefs = null;
        function kwds2albHTML () {
            return jt.tac2html(
                ["div", {cla:"buttondlgdiv"},
                 [["button", {
                     type:"button",
                     title:"Add selected keywords to all Album songs",
                     onclick:mdfs("kwd.togkwds2alb")},
                   [["img", {cla:"tunactimg inv", src:"img/keys.png"}],
                    "&nbsp;<b>&#x21d2;</b>&nbsp;", //rightwards double arrow
                    ["img", {cla:"tunactimg inv", src:"img/album.png"}]]],
                  ["div", {id:"kwds2albconfdiv"}]]]); }
        function humanReadKwds (kwdcsv) {
            const qks = kwdcsv.csvarray().map((kwd) => "\"" + kwd + "\"");
            return qks.join(", "); }
    return {
        initialize: function () {
            app.pdat.addApresDataNotificationTask("kwdTogInit", function () {
                mgrs.kwd.rebuildToggles(); }); },
        makeToggleButton: function (kd, idx) {
            var tc = "kwdtogoff";
            if(pmso.song && pmso.song.kws && pmso.song.kws.csvcontains(kd.kw)) {
                tc = "kwdtogon"; }
            return ["button", {type:"button", cla:tc, id:"kwdtog" + idx,
                               title:kd.dsc || "",
                               onclick:mdfs("kwd.toggleKeyword", idx)},
                    kd.kw]; },
        toggleKeyword: function (idx) {
            const cto = pmso.cto();
            cto.kws = cto.kws || "";
            const button = jt.byId("kwdtog" + idx);
            if(button.className === "kwdtogoff") {
                button.className = "kwdtogon";
                //removing first does no harm if not found, and protects against
                //doubling if an interleaved data update already added the kw
                cto.kws = cto.kws.csvremove(button.innerHTML);
                cto.kws = cto.kws.csvappend(button.innerHTML); }
            else {
                button.className = "kwdtogoff";
                cto.kws = cto.kws.csvremove(button.innerHTML); }
            jt.log("toggleKeyword " + button.className.slice(6) + ": " +
                   button.innerHTML + " kws:" + cto.kws + " p:" + cto.path);
            mgrs.kwd.togkwds2alb("off");
            app.top.dispatch("gen", "togtopdlg", "", "close");  //sc changed
            mgrs.scm.noteSongModified("kwd"); },
        rebuildToggles: function (context) {
            kwdefs = app.top.dispatch("kwd", "defsArray", true);
            jt.out("kwdsdiv", jt.tac2html(
                [["button", {type:"button", id:"kwdexpb",
                             onclick:mdfs("kwd.toggleExpansion")},
                  "+"],
                 ["span", {id:"newkwspan"}],
                 ...kwdefs.filter((kd) => kd.pos > 0).map((kd, idx) =>
                     mgrs.kwd.makeToggleButton(kd, idx)),
                 ["span", {id:"extrakwspan"}]]));
            if(context === "playeradd") {
                mgrs.kwd.toggleExpansion(); } },
        toggleExpansion: function (togstate) {
            var togb = jt.byId("kwdexpb");
            if(!togb) { return; }  //ignore any spurious UI setup calls
            if(togb.innerHTML === "+" && togstate !== "off") {
                jt.out("newkwspan", jt.tac2html(
                    [["input", {type:"text", id:"kwdin", size:10, value:"",
                                placeholder:"new keyword"}],
                     ["button", {type:"button", id:"addkwb",
                                 onclick:mdfs("kwd.addNewKeyword")}, "+"]]));
                jt.out("extrakwspan", jt.tac2html(
                    kwdefs.filter((kd) => kd.pos <= 0).map((kd, i) =>
                        mgrs.kwd.makeToggleButton(kd, i + 4))
                        .concat(kwds2albHTML())));
                togb.innerHTML = "-"; }
            else {
                jt.out("newkwspan", "");
                jt.out("extrakwspan", "");
                togb.innerHTML = "+"; } },
        addNewKeyword: function () {
            var kwd = jt.byId("kwdin").value;
            if(!kwd || !kwd.trim()) { return; }
            kwd = kwd.replace(/\s/, "");  //no spaces
            kwd = kwd.capitalize();       //capitalized
            kwd = kwd.slice(0, 10);       //max 10 chars
            if(kwdefs.find((kd) => kd.kw === kwd)) {
                jt.byId("kwdin").value = "";  //clear duplicate value
                return; }
            jt.byId("addkwb").disabled = true;
            jt.out("extrakwspan", "Adding " + kwd + "...");
            if(!pmso.cto().kws.csvcontains(kwd)) {
                pmso.cto().kws = pmso.cto().kws.csvappend(kwd);
                mgrs.scm.noteSongModified("kwdadd"); }
            app.top.dispatch("kwd", "addKeyword", kwd, "playeradd"); },
        togkwds2alb: function (togstate) {
            //Not worth extending to remove all keywords. Use a marker kw.
            const divid = "kwds2albconfdiv";
            const div = jt.byId(divid);
            if(div && div.innerHTML) { div.innerHTML = ""; }  //clear old
            if(togstate === "off") { return; }  //toggled off
            const wasoa = " with all songs on \"" + pmso.cto().ab + "\"";
            if(!pmso.cto().kws) {
                div.innerHTML = "Select keywords to associate" + wasoa;
                return; }
            const ropts = [{v:"overwrite", t:"Overwrite"},
                           {v:"addifmiss", t:"Add if not already set",
                            c:"checked"}];
            jt.out(divid, jt.tac2html(
                ["Associate " + humanReadKwds(pmso.cto().kws) + wasoa + "?",
                 ["div", {id:"abactoptsdiv"},
                  [ropts.map((ao) =>
                      ["div", {cla:"tuneoptiondiv"},
                       [["input", {type:"radio", id:"assocrad" + ao.v,
                                   name:"assocoption", value:ao.v,
                                   checked:jt.toru(ao.c)}],
                        ["label", {fo:"assocrad" + ao.v}, ao.t]]]),
                   ["button", {type:"button",
                               onclick:mdfs("kwd.assocKwdProc", "ab")},
                    "Update Songs"]]]])); },
        assocKwdProc: function (fld) {
            var updsongs = [];
            var merge = jt.byId("assocradaddifmiss");
            if(merge) {
                merge = merge.checked; }
            jt.out("abactoptsdiv", "Marking...");
            const locmod = new Date().toISOString();
            Object.values(app.pdat.songsDict()).forEach(function (s) {
                if(s[fld] === pmso.cto()[fld] && s.ar === pmso.cto().ar) {
                    if(merge) {
                        pmso.cto().kws.csvarray().forEach(function (kw) {
                            s.kws = s.kws.csvremove(kw);
                            s.kws = s.kws.csvappend(kw); }); }
                    else {
                        s.kws = pmso.cto().kws; }
                    s.locmod = locmod;
                    updsongs.push(s); } });
            jt.out("abactoptsdiv", "Updating " + updsongs.length + " songs...");
            app.pdat.writeDigDat("cmt.assocKwdProc", {songs:updsongs},
                function () {
                    jt.out("abactoptsdiv", String(updsongs.length) +
                           " songs updated."); },
                function (code, errtxt) {
                    jt.out("abactoptsdiv", "Song update failed " +
                           code + ": " + errtxt); }); }
    };  //end mgrs.kwd returned functions
    }());


    //handle the song comment display and entry
    mgrs.cmt = (function () {
        const ost = {mode:"", dispf:null, odi:"panplayoverlaydiv"};
        const modeps = {
            share: {bids:["sg2cbb", "sg2dhb"], statd:"sharestatdiv"},
            comment: {bids:["cancelb", "savcmtb"], statd:"cmtstatdiv"}};
        const sfos = [{v:"P", t:"Playable"},  //selectable frequency options
                      {v:"B", t:"Tired"},
                      {v:"R", t:"Don't Suggest"}];
        const subcats = {"P":["N",   //Newly added song
                              "P"],  //Playable
                         "B":["B",   //Back-burner, 90 days between plays
                              "Z",   //Resting, default 180 days between plays
                              "O"],  //Overplayed, 365 days between plays
                         "R":["R",   //Reference only, do not play by default
                              "M",   //Metadata no longer matches media
                              "I",   //Ignore, song is in an ignore folder
                              "D",   //Deleted, media file no longer available
                              "U"]}; //Unreadable, no metadata, corrupted etc.
        function isSubcatValue (cat, val) {
            return (subcats[cat] && subcats[cat].indexOf(val) >= 0); }
        function tuningDisplayMode (val) {
            var sfo = sfos.find((sfo) => isSubcatValue(sfo.v, val));
            sfo = sfo || sfos[0];
            return sfo.v; }
        function isSelVal (radval) {
            var songval = ost.song.fq || "P";
            if(songval === "0") { songval = "P"; }  //tolerate bad data init
            songval = songval.slice(0, 1);  //e.g treat "DP" as Deleted
            return isSubcatValue(radval, songval); }
        function impressionSummary () {
            const eavs = mgrs.cmt.elal2txtvals(ost.song);
            return [{lab:"Keywords", val:ost.song.kws || "none"},
                    {lab:eavs.el.pn, val:eavs.el.val},
                    {lab:eavs.al.pn, val:eavs.al.val}]; }
        function clipboardSongDescription (s) {
            var txt = s.ti + "\nby: " + s.ar + "\n";
            if(s.ab !== "Singles") {
                txt += "album: " + s.ab; }
            const ct = mgrs.cmt.cleanCommentText(ost.song.nt);
            if(ct) {
                txt += "\n" + ct + "\n"; }
            txt += "\n";
            txt += impressionSummary().map((imp) =>
                (imp.lab + ": " + imp.val)).join("\n");
            const acct = app.top.dispatch("aaa", "getAccount");
            if(acct && acct.digname) {
                txt += "\nhttps://diggerhub.com/listener/" + acct.digname + 
                    "\n"; }
            return txt; }
        function prevPlayAndDupesHTML () {
            var pp = ""; var ddct = ""; var dupesongshtml = "";
            if(ost.prevPlayed) {
                pp = jt.tz2human(ost.prevPlayed);
                pp = "Previously played " + pp; }
            const dupes = app.deck.dispatch("sdt", "getSongDupes", ost.song);
            if(dupes && dupes.length) {
                const dn = dupes.length;
                ddct = jt.tac2html(
                    [", ",
                     ["a", {href:"#togdupedisplay",
                            onclick:jt.fs("app.docs.togdivdisp('" +
                                          "dupesdispdiv')")},
                      dn + " dupe" + ((dn > 1)? "s" : "")]]);
                dupesongshtml = jt.tac2html(
                    dupes.map((s) =>
                        ["div", {cla:"dupesongdispdiv"},
                         app.deck.dispatch("util", "songIdentHTML", s)])); }
            return jt.tac2html(
                ["div", {id:"prevplaydiv"},
                 [["span", {id:"ppvalspan"}, pp],
                  ddct,
                  ["div", {id:"dupesdispdiv", style:"display:none"},
                   dupesongshtml]]]); }
        function genreDispHTML () {
            var html = ""; var gv;
            if(ost.song.genrejson) {
                try {
                    gv = JSON.parse(ost.song.genrejson);
                    if(Array.isArray(gv)) {
                        gv = gv.map((g) => jt.escq(g)).join(", "); }
                    html = "Genre: " + gv;
                } catch(e) {
                    jt.log("genreDispHTML err " + e); } }
            return html; }
        function resStat(txt) {
            jt.log("player.cmt.resStat: " + txt);
            jt.out(modeps[ost.mode].statd, jt.tac2html(
                ["div", {id:"resstatcontdiv"},
                 [["div", {id:"pdlgstattxtdiv"}, txt],
                  ["a", {href:"#done", onclick:mdfs("cmt.closeOverlay")},
                   "Ok"]]]));
            ost.btdonef(); }
        function showTiredAlbumButton () {
            jt.out("albtireddiv", "");
            if(isSubcatValue("B", ost.song.fq)) {
                jt.out("albtireddiv", jt.tac2html(
                    ["div", {cla:"buttondlgdiv"},
                     [["button", {type:"button",
                                  title:"Mark all songs on this album as tired",
                                  onclick:mdfs("cmt.snoozeAllSongsOnAlbum")},
                       [["img", {cla:"tunactimg inv", src:"img/album.png"}],
                        "&nbsp;<b>&#x21d2;</b>&nbsp;", //rightwards double arrow
                        ["img", {cla:"tunactimg inv", src:"img/snzblk.png"}]]],
                      ["div", {id:"albtiredconfdiv"}]]])); } }
        const buttons = {
            sg2cbb: {name:"Clipboard", handler:function () {
                const txt = clipboardSongDescription(ost.song);
                app.svc.copyToClipboard(txt,
                    function () {
                        resStat("Details copied to clipboard."); },
                    function () {  //no helpful error info, and none returned
                        resStat("Clipboard copy failed."); }); }},
            sg2dhb: {name:"DiggerHub", handler:function () {
                if(!app.util.haveHubCredentials()) {
                    return resStat("Sign in to share songs."); }
                if(!mgrs.cmt.cleanCommentText(ost.song.nt)) {
                    return resStat("Write a comment to share"); }
                const start = new Date(Date.now() - 2000).toISOString();
                app.svc.fanMessage(
                    app.util.authdata({action:"share", idcsv:ost.song.dsId}),
                    function (msgs) {
                        if(!msgs.length) {
                            resStat("No confirmation, try again later."); }
                        else if(msgs[0].created > start) {
                            resStat("Song shared with your listeners."); }
                        else {
                            resStat("Song already shared."); } },
                    function (code, errtxt) {
                        resStat(code + ": " + errtxt); }); }},
            cancelb: {name:"Cancel", handler:function () {
                mgrs.cmt.closeOverlay(); }},
            savcmtb: {name:"Ok", handler:function () {
                ost.song.nt = jt.byId("commentta").value;
                ost.song.lp = new Date().toISOString();
                mgrs.cmt.closeOverlay();
                mgrs.cmt.updateIndicators();
                mgrs.scm.noteSongModified("cmt"); }}};
        function buttonsHTML () {
            return jt.tac2html(modeps[ost.mode].bids.map((bid) =>
                ["button", {type:"button", id:bid,
                            onclick:mdfs("cmt.buttonHandler", bid)},
                 buttons[bid].name])); }
        function togDialog (togstate, mode, dispf) {
            ost.song = null;
            ost.mode = mode || "";
            const odiv = jt.byId(ost.odi);
            if(togstate === "off" || (odiv.style.display !== "none" &&
                                      togstate !== "on")) {
                odiv.style.display = "none";
                return; }
            mgrs.kwd.toggleExpansion("off");
            if(!pmso.song) { return jt.log("togDialog: no song playing"); }
            ost.song = pmso.song;  //dialog update reference
            const ppmdiv = jt.byId("panplaydiv");
            odiv.style.display = "block";
            odiv.style.height = (ppmdiv.offsetHeight - 5) + "px";
            odiv.style.width = (ppmdiv.offsetWidth - 5) + "px";
            odiv.innerHTML = jt.tac2html(
                ["div", {id:"ppocontdiv",
                         onclick:mdfs("cmt.ignoreClick", "event")},
                 [["div", {id:"pposidiv"}, 
                   app.deck.dispatch("util", "songIdentHTML", ost.song)],
                  dispf()]]); }
        function allowablePercolatingEvent (event) {
            return (event && event.target && event.target.id &&
                    event.target.id.startsWith("tunerad")); }
            
    return {
        getMode: function () { return ost.mode; },
        cleanCommentText: function (txt) {
            txt = txt || "";
            if(txt) {
                txt = txt.replace(/Amazon.com Song ID: \d+/, "").trim();
                txt = txt.replace(/copyright \d\d\d\d .*/ig, "").trim(); }
            return txt; },
        elal2txtvals: function (s) {
            const vals = {
                el:{pn:"Energy Level", val:"Nominal"},
                al:{pn:"Approachability", val:"Nominal"}};
            if(s.el <= 45) { vals.el.val = "Chill"; }
            if(s.el >= 65) { vals.el.val = "Amped"; }
            if(s.al <= 40) { vals.al.val = "Easy"; }
            if(s.al >= 72) { vals.al.val = "Hard"; }
            return vals; },
        clipboardTextForSong: function (s) {  //called from hub profile
            const temp = ost.song;
            ost.song = s;
            const txt = clipboardSongDescription(s);
            ost.song = temp;
            return txt; },
        closeOverlay: function (event) {
            if(!allowablePercolatingEvent(event)) {
                togDialog("off"); } },
        ignoreClick: function (event) {
            if(!allowablePercolatingEvent(event)) {
                jt.evtend(event); } },
        toggleCommentDisplay: function (togstate) {
            togDialog(togstate, "comment", function () {
                const html = jt.tac2html(
                    ["div", {id:"commentdispdiv"},
                     [["textarea", {id:"commentta", name:"commentta", 
                                    rows:4, cols:40,
                                    //comments vary a lot. placeholder text
                                    //can interrupt the writing process.
                                    placeholder:""},
                       ost.song.nt || ""],
                      ["div", {cla:"dlgbuttonsdiv"}, buttonsHTML()],
                      ["div", {id:"cmtstatdiv"}]]]);
                setTimeout(function () {
                    const cta = jt.byId("commentta");
                    if(cta) {
                        cta.focus(); } }, 150);
                return html; }); },
        updateIndicators: function () {
            const tuneimg = jt.byId("tuneimg");
            if(tuneimg) {
                tuneimg.src = "img/tunefork.png";  //reset
                if(tuningDisplayMode(pmso.cto().fq) !== "P") {
                    tuneimg.src = "img/tuneforkact.png"; } }
            const commentimg = jt.byId("togcommentimg");
            if(commentimg) {
                commentimg.src = "img/comment.png";  //reset
                if(mgrs.cmt.cleanCommentText(pmso.cto().nt)) {
                    commentimg.src = "img/commentact.png"; } } },
        toggleSongShare: function (togstate) {
            togDialog(togstate, "share", function () { return jt.tac2html(
                [["div", {id:"sharedispdiv"},
                  [["div", ["img", {id:"sharesrcimg",
                                    src:"img/diggerbutton.png"}]],
                   ["div", ["img", {id:"sharrowimg",
                                    src:"img/sharrow.png"}]],
                   ["div", {id:"shbdiv"}, buttonsHTML()]]],
                 ["div", {id:"sharestatdiv"}]]); }); },
        toggleTuningOpts: function (togstate) {
            togDialog(togstate, "tuning", function () {
                const html = jt.tac2html(
                    ["div", {id:"tunefqdispdiv", cla:"togdlgabspos"},
                     [["div", {id:"frequencyoptionsdiv"},
                       sfos.map((fo) =>
                           ["div", {cla:"tuneoptiondiv"},
                            [["input", {type:"radio", id:"tunerad" + fo.v,
                                        name:"tuneoption", value:fo.v,
                                        checked:jt.toru(isSelVal(fo.v)),
                                        onclick:mdfs("cmt.updateSongFrequency",
                                                     "event")}],
                             ["label", {fo:"tunerad" + fo.v}, fo.t]]])],
                      ["div", {id:"tuningdetdiv"}, 
                       ["div", {id:"tunedetdiv"},
                        [["div", {id:"prevplaydupesdiv"},
                          prevPlayAndDupesHTML()],
                         ["div", {id:"playcountdiv"},
                          "Digger plays: " + pmso.song.pc],
                         ["div", {id:"genresdiv"}, genreDispHTML()],
                         ["div", {id:"songurldiv"},
                          "Source: " + pmso.song.path],
                         ["div", {id:"albtireddiv"}]]]]]]);
                setTimeout(showTiredAlbumButton, 500);
                return html; }); },
        updateSongFrequency: function (event) {
            var rbv = event.target.value;
            if(!isSubcatValue(rbv, pmso.cto().fq)) {  //value changed
                ost.song.fq = rbv;    //for local reference
                pmso.cto().fq = rbv;   //for updated song save
                showTiredAlbumButton();
                mgrs.cmt.updateIndicators();
                mgrs.scm.noteSongModified("freq"); } },
        reflectChangedSongFrequency: function (ignore /*fld*/, val) {
            const button = jt.byId("tunerad" + tuningDisplayMode(val));
            if(button && !button.checked) {
                //pmso.cto().fq already updated, just reflecting the value
                showTiredAlbumButton();
                mgrs.cmt.updateIndicators();
                button.checked = true; } },
        snoozeAllSongsOnAlbum: function () {
            const divid = "albtiredconfdiv";
            const div = jt.byId(divid);
            if(div.innerHTML) {  //already displayed, toggle off
                div.innerHTML = "";
                return; }
            jt.out(divid, jt.tac2html(
                ["div", {id:"albtiredconfcontdiv"},
                 ["Mark all songs tired on \"" + ost.song.ab + "\"?",
                  ["div", {id:"abactoptsdiv"},
                   ["button", {type:"button",
                               onclick:mdfs("cmt.snoozeAlbumSongsProc")},
                    "Mark All Songs Tired"]]]])); },
        snoozeAlbumSongsProc: function () {
            var updsongs = [];
            jt.out("abactoptsdiv", "Marking...");
            const locmod = new Date().toISOString();
            Object.values(app.pdat.songsDict()).forEach(function (s) {
                if(s.ab === ost.song.ab && s.ar === ost.song.ar) {
                    if(subcats.B.indexOf(s.fq) < 0) {  //not tired at all
                        s.fq = "B";
                        s.locmod = locmod;
                        updsongs.push(s); } } });
            if(!updsongs.length) {
                jt.out("abactoptsdiv", "All songs marked as tired.");
                return; }
            jt.out("abactoptsdiv", "Updating " + updsongs.length + " songs...");
            app.pdat.writeDigDat("cmt.snoozeAlbumSongsProc", {songs:updsongs},
                function () {
                    jt.out("abactoptsdiv", String(updsongs.length) +
                           " songs updated."); },
                function (code, errtxt) {
                    jt.out("abactoptsdiv", "Song update failed " +
                           code + ": " + errtxt); }); },
        bumpTired: function (song) {  //general utility
            var tfqidx = subcats.B.indexOf(pmso.cto().fq);
            if(tfqidx < 0) {  //not currently marked as tired
                song.fq = "B";
                return true; }
            if(tfqidx >= 0 && tfqidx < subcats.B.length - 1) {
                song.fq = subcats.B[tfqidx + 1];
                return true; }
            return false; },
        bumpCurrentIfTired: function () {
            if(pmso.song &&  //check if already marked tired
               subcats.B.findIndex((v) => v === pmso.song.fq) >= 0) {
                if(mgrs.cmt.bumpTired(pmso.song)) {  //made tireder
                    mgrs.scm.noteSongModified("freqbump"); } } },
        toggleOtherDisplay: function (togstate, mode, dispf) {
            togDialog(togstate, mode, dispf); },
        buttonHandler: function (bid) {
            jt.byId(bid).disabled = true;
            ost.btdonef = function () { jt.byId(bid).disabled = false; };
            buttons[bid].handler(); },
        resetDisplay: function (caller) {
            jt.log("cmt.resetDisplay called from " + (caller || "Unknown"));
            togDialog("off");
            mgrs.cmt.updateIndicators(); }
    };  //end mgrs.cmt returned functions
    }());


    ////////////////////////////////////////
    // Playback and transport
    ////////////////////////////////////////

    //Player UI manager creates and maintains a playback UI in audiodiv.
    //Instantiated by platform svc as needed for audio.
    mgrs.plui = (function () {
        var pbco = null;  //playback control object
        const ppb = {st:"paused", img:"img/play.png", wrk:""};
        const prog = {pos:0, dur:0, w:200, left:16, //CSS pluiprogbgdiv left
                      divs:["pluiprogbgdiv", "pluiprogclickdiv"],
                      mf:4,  //max float: #secs allowed without calling pbco
                      fb:5,  //float border: #secs from start/end for fast check
                      rt:0,  //received tick (timestamp in millis)
                      tmo: null,  //timer for next tick call
                      mode:"active"};  //"inactive" in sleep mode
        function mmss (ms) {
            var sep = ":";
            ms = Math.round(ms / 1000);
            const secs = ms % 60;
            if(secs <= 9) {
                sep += "0"; }
            return String(Math.floor(ms / 60)) + sep + secs; }
        function updatePosIndicator () {
            //update progress bar
            var prw = 0; var progdiv = jt.byId("pluiprogdiv");
            if(!progdiv) {
                return jt.log("updatePosIndicator quitting since no progdiv"); }
            if(prog.dur) {
                prog.pos = Math.min(prog.pos, prog.dur);  //don't overrun end
                prw = Math.round((prog.pos / prog.dur) * prog.w); }
            progdiv.style.width = prw + "px";
            //update time readout and position
            jt.out("pluitimeposdiv", mmss(prog.pos));
            jt.out("pluitimedurdiv", mmss(prog.dur));
            const posdiv = jt.byId("pluiposdiv");
            posdiv.style.width =
                (jt.byId("pluitimeposdiv").getBoundingClientRect().width +
                 jt.byId("pluitimesepdiv").getBoundingClientRect().width +
                 jt.byId("pluitimedurdiv").getBoundingClientRect().width +
                 6) + "px";
            const posw = posdiv.getBoundingClientRect().width;
            const left = (prog.left + prw) - Math.floor(posw / 2);
            posdiv.style.left = left + "px"; }
        function updatePlaybackControlImage (state) {
            if(state === "playing") {
                ppb.img = "img/pause.png"; }
            else { //"paused", "ended", ""
                ppb.img = "img/play.png"; }
            jt.byId("pluibimg").src = ppb.img; }
        function logScheduling (txt) {
            //Can be helpful to see "float tick" or "full status request"
            //log messages, but hard to collapse repetitive polling messages
            //in filter.dcm so not active.
            //jt.log("scheduleTransportStateRecheck " + txt);
            return txt; }
        function clearTicker (requireFullStatus) {
            if(prog.tmo) {  //clear previously scheduled tick in case active
                clearTimeout(prog.tmo); }
            prog.tmo = null;  //for debugging state clarity
            if(requireFullStatus) {
                prog.rt = 0; } } //disable floating tick
        function scheduleTransportStateRecheck () {
            const stsr = {};  //condition testing blackboard
            const now = Date.now();
            if(prog.tmo) {
                stsr.dispo = "Already waiting for tick"; }
            if(!stsr.dispo) {
                clearTicker();
                if(prog.mode !== "active") {
                    stsr.dispo = "Not active. mode: " + prog.mode; } }
            if(!stsr.dispo) {
                if(!prog.rt) {
                    stsr.nofloat = "No previous real status receive ts"; }
                else if(now - prog.rt > prog.fb * 1000) {
                    stsr.nofloat = "Call lag exceeded float border amount"; }
                else if(ppb.st !== "playing" && ppb.st !== "paused") {
                    stsr.nofloat = "Not playing or paused. ppb.st: " + ppb.st; }
                else if(now - (prog.mf * 1000) > prog.rt) {
                    stsr.nofloat = "Over max allowed float"; }
                else if(prog.pos < prog.fb * 1000) {
                    stsr.nofloat = "Within " + prog.fb + " secs of beginning"; }
                else if(prog.pos > prog.dur - (prog.fb * 1000)) {
                    stsr.nofloat = "Within " + prog.fb + " secs of end"; }
                if(!stsr.nofloat) {
                    stsr.dispo = "Float tick to minimize plat resource use";
                    prog.tmo = setTimeout(function () {  //UI only float call
                        clearTicker();
                        if(ppb.st === "playing") {
                            prog.pos += 1000; } //move forward one tick
                        updatePosIndicator();
                        scheduleTransportStateRecheck(); }, 1000); } }
            if(!stsr.dispo) {
                stsr.dispo = "Full status request";
                //need to call for hard status return. Use common util
                //rather than pbco to avoid collisions and common errors.
                prog.tmo = setTimeout(function () {
                    clearTicker();
                    //no separate cbf for request, playback state updated
                    //by reflectUpdatedStatusInfo
                    mgrs.uiu.requestPlaybackStatus("plui.stateCheck"); },
                                      1000); }  //one second is one tick
            logScheduling(JSON.stringify(stsr)); }
    return {
        initInterface: function (playbackControlObject, maxFloatSeconds) {
            if(!jt.byId("audiodiv")) {
                return jt.log("mgrs.plui.initInterface has no audiodiv"); }
            pbco = playbackControlObject;
            prog.mf = maxFloatSeconds || prog.mf;
            prog.fb = prog.mf + 2;  //lag can take a sec
            jt.out("audiodiv", jt.tac2html(
                ["div", {id:"pluidiv"},
                 [["div", {id:"pluibdiv"},
                   ["img", {id:"pluibimg", src:ppb.img,
                            onclick:mdfs("plui.togglePlaybackState")}]],
                  ["div", {id:"pluiprogdispdiv"},
                   [["div", {id:"pluiprogbgdiv"}],
                    ["div", {id:"pluiprogdiv"}],
                    ["div", {id:"pluiposdiv",
                             onclick:mdfs("plui.togglePlaybackState")},
                     [["div", {id:"pluitimeposdiv"}, "0:00"],
                      ["div", {id:"pluitimesepdiv"}, "|"],
                      ["div", {id:"pluitimedurdiv"}, "0:00"]]],
                    ["div", {id:"pluiprogclickdiv",
                             onclick:mdfs("plui.seek", "event")}]]]]]));
            prog.divs.forEach(function (divid) {
                jt.byId(divid).style.width = prog.w + "px"; });
            app.spacebarhookfunc = mgrs.plui.togglePlaybackState;
            updatePosIndicator(); },
        updateTransportControls: function (status) {
            if(!pbco) {
                return jt.log("updateTransportControls no pbco"); }
            ppb.wrk = "";  //no longer processing pause/resume
            ppb.st = status.state;
            updatePlaybackControlImage(ppb.st);
            prog.pos = status.pos;
            prog.dur = status.dur;
            prog.prevrt = prog.rt || 0;
            prog.rt = Date.now();
            updatePosIndicator();
            //If triggered externally, playback may start, or restart after
            //"ended", without notice.  For the UI to react, it must poll.
            scheduleTransportStateRecheck(); },
        rezeroPlaybackPosition: function () {
            if(!jt.byId("pluidiv")) { return; }  //plui not available
            mgrs.plui.updateTransportControls(
                {state:"playing", pos:0, dur:0}); },
        togglePlaybackState: function () {
            const logid = "plui.togglePlaybackState";
            jt.log(logid + " from " + ppb.st);
            //update UI image first, then call pbco and get updated status
            clearTicker(true);
            if(ppb.st === "paused") {
                updatePlaybackControlImage("playing");
                ppb.wrk = "resuming";
                pbco.resume(); }
            else {  //playing
                updatePlaybackControlImage("paused");
                ppb.wrk = "pausing";
                pbco.pause(); }
            //listen for playback status to confirm playback state change
            mgrs.uiu.requestPlaybackStatus(logid, function (status) {
                jt.log(logid + " req cbf updating ctrls " + status.state);
                mgrs.plui.updateTransportControls(status); }); },
        seek: function (event) {
            var clickrect = event.target.getBoundingClientRect();
            var x = event.clientX - clickrect.left;
            var ms = Math.round(x / prog.w * prog.dur);
            if(ms < 5000) { ms = 0; }  //close enough, restart from beginning
            prog.pos = ms;         //update pos now, seek call not instant
            updatePosIndicator();
            clearTicker(true);
            pmso.prevst = null;    //do not trigger stale data reload
            scheduleTransportStateRecheck();  //waits one second
            pbco.seek(ms); },
        recheckStatus: function () {
            if(pbco) {  //initialized
                clearTicker(true);
                scheduleTransportStateRecheck(); } },
        pollingMode: function (statestr, caller) {
            prog.mode = statestr;
            jt.log("plui.pollingMode " + prog.mode + " " + (caller || ""));
            if(prog.mode === "active") {
                clearTicker(true);
                scheduleTransportStateRecheck(); }
            else {
                clearTicker(); } },
        pollingStatusInfo: function () {
            return {mode:prog.mode, freqms:(prog.mf + 1) * 1000}; },
        pause: function () {
            if(pbco) {
                pbco.pause(); } }
    };  //end mgrs.plui returned functions
    }());


    //sleep manager handles UI and state tracking for sleeping playback
    //after N more songs.  Works as a playback queue limit with countdown
    //monitoring off the latest playback queue.
    mgrs.slp = (function () {
        const scms = {  //sleep completion messages
            lastpl: "Slept after song finished.",
            unexpl: "Sleep overridden by external control."};
        const runst = {  //sleep runtime state
            endSongType: "",
            endState: "",
            res: "off"};  //indeterminate, countingdown, waiting, ended
        const pssdvs = {  //persistent sleep state default values
            act: "",  //UI. Not active.  Otherwise "active" or "sleeping".
            cnt: 0,   //UI. How many songs after now playing before sleep.
            rempaths: [],  //{lp,ti,path} of song paths left to play
            rempts: new Date(0).toISOString(), //when rempaths last updated
            nppsa: "",   //now playing path when sleep activated
            lspbs: ""};  //last song path to play before sleeping
        function sleepstate () {  //fetch sleep state, initializing as needed
            var ps = app.pdat.uips("player");  //player state
            ps.sleep = ps.sleep || {};
            const sst = ps.sleep;  //sleep state (persistent)
            Object.keys(pssdvs).forEach(function (key) {
                sst[key] = sst[key] || pssdvs[key]; });
            return sst; }
        function turnSleepOff (scope, reason) {
            jt.log("turnSleepOff " + scope + " " + reason);
            const sst = sleepstate();
            Object.keys(pssdvs).forEach(function (key) {
                sst[key] = pssdvs[key]; });
            if(scope === "uindb") {
                const scb = jt.byId("sleepactivecb");
                if(scb) {
                    scb.checked = false; }
                const sel = jt.byId("sleepcountsel");
                if(sel) {
                    sel.value = 0; } } }
        function updateSleepMainButtonDisplay () {
            const sst = sleepstate();
            jt.out("sleepcntssdiv", sst.cnt || "");
            jt.byId("togsleepimg").src = (sst.act? "img/sleepactive.png"
                                          : "img/sleep.png"); }
        function clearSleepDialog () {
            mgrs.cmt.toggleOtherDisplay("off");
            jt.out("sleepmsgdispdiv", "");  //clear dlg message content if avail
            turnSleepOff("uindb", "clearSleepDialog");
            updateSleepMainButtonDisplay(); }
        function showParameterControls (sst) {  //rebuild from current state
            const svos = [0, 1, 2, 3, 4, 5];
            jt.out("sleepdiv", jt.tac2html(
                [["a", {href:"#close",
                        onclick:mdfs("slp.toggleSleepDisplay", "close")},
                  "Sleep after "],
                 ["select", {id:"sleepcountsel", title:"Sleep counter",
                             onchange:mdfs("slp.updateSleepState",
                                           "changecount")},
                  svos.map((v) =>
                      ["option", {value:v, selected:jt.toru(v === sst.cnt)},
                       String(v)])],  //show "0"
                 ["a", {href:"#close",
                        onclick:mdfs("slp.toggleSleepDisplay", "close")},
                  " more "],
                 ["input", {type:"checkbox", id:"sleepactivecb",
                            checked:"checked",  //on if detail controls shown
                            onclick:mdfs("slp.updateSleepState", 
                                         "checkbox")}]])); }
        function sleepCompletionDialog (msg) {
            mgrs.slp.toggleSleepDisplay("close");  //deactivate controls if open
            mgrs.cmt.toggleOtherDisplay("on", "sleep", function () {
                return jt.tac2html(
                    ["div", {id:"sleepmsgdispdiv", cla:"togdlgabspos"},
                     [msg,
                      ["div", {id:"acksleepbuttonsdiv", cla:"dlgbuttonsdiv"},
                       ["button", {type:"button", 
                                   onclick:mdfs("slp.ackSleepProcDone")},
                        "Ok"]]]]); });
            //Playback may have started up again on app UI reforeground
            setTimeout(function () { mgrs.plui.pause(); }, 50); }
        function sleepQueueEndSongType (sst) {
            if(pmso.song.path === sst.lspbs) { return "lastsong"; }
            if(pmso.song.path === sst.nppsa) { return "firstsong"; }
            return ""; }
        function recognizedEndState () {
            const cs = pmso.currst;
            if(cs) {
                if(cs.state === "ended") { return "ended"; }
                if(cs.state === "paused") {
                    if(cs.pos === 0) { return "rtzpause"; }
                    if(cs.dur - cs.pos < 2000) { return "endpause"; } } }
            return ""; }
        function rempathsFromSongs (songs) {
            return songs.map((s) => ({lp:s.lp, ti:jt.ellipsis(s.ti, 30),
                                      path:s.path})); }
        function remainingPathsToPlay (sst) {
            const sd = app.pdat.songsDict();
            const songs = sst.rempaths.map((p) => sd[p.path]);
            const npy = songs.filter((s) => !s.lp || s.lp < sst.rempts);
            const res = rempathsFromSongs(npy);
            jt.log("slp.remainingPathsToPlay " + sst.rempts + ": " +
                   JSON.stringify(res));
            return res; }
        function updateState (sst) {
            sst.rempaths = remainingPathsToPlay(sst);
            sst.cnt = sst.rempaths.length;
            runst.endSongType = "";
            runst.endState = "";
            runst.res = "recalculating";
            if(sst.cnt) {
                runst.res = "countingdown"; }
            else {  //no songs left before sleep
                if(!pmso.song) {  //most likely svc status comms hiccup
                    runst.res = "indeterminate"; }
                else {  //have pmso.song
                    runst.endSongType = sleepQueueEndSongType(sst);
                    if(!runst.endSongType) {  //no context left to monitor
                        turnSleepOff("uindb", "unrecognized last song");
                        updateSleepMainButtonDisplay();
                        mgrs.plui.pollingMode("active", "slp deactivated");
                        runst.res = "off"; }
                    else {  //known last song type
                        runst.endState = recognizedEndState();
                        if(runst.endState) {  //known ending state
                            runst.res = "ended";
                            mgrs.plui.pollingMode("inactive", "slp ended"); }
                        else {
                            runst.res = "waiting"; } } } }
            jt.log("slp.updateState " + JSON.stringify(runst)); }
        function sleepDialogDisplayed () {
            const smdd = jt.byId("sleepmsgdispdiv");
            return (smdd && smdd.innerHTML); }
        function displaySleepDialog (logpre) {
            if(sleepDialogDisplayed()) {
                jt.log(logpre + "redisplaying dialog"); }
            if(runst.res === "ended") {
                jt.log(logpre + "playback ended");
                sleepCompletionDialog(scms.lastpl); }
            else {  //playback did not end in any recognizable way
                jt.log(logpre + "playback did not end. state:" +
                       pmso.state + ", path:" + pmso.song.path);
                sleepCompletionDialog(scms.unexpl); } }
        function checkIfSleeping (caller) {
            const logpre = caller + " checkIfSleeping ";
            const sst = sleepstate();
            if(!sst.act && pmso.state !== "ended") {
                return; } //sleep inactive is normal, no general log msg.
            updateState(sst);
            if(sleepDialogDisplayed() || runst.res === "ended") {
                displaySleepDialog(logpre); }
            updateSleepMainButtonDisplay(); } //reflect updated state
        function wakeupAndPlay () {
            jt.log("wakeupAndPlay resuming playback");
            clearTimeout(runst.waptmo);  //in case scheduled
            runst.waptmo = null;
            clearSleepDialog();  //might have reactivated from state restore
            mgrs.plui.pollingMode("active", "ackSleepProcDone");
            app.deck.playNextSong(); }
        function digDatUpdated (/*digdat*/) {
            checkIfSleeping("digDatUpdated"); }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("player.slp", digDatUpdated); },
        notePlayerStateChange: function () {
            checkIfSleeping("notePlayerStateChange"); },
        waitingOnSleepDialog: function () {
            const sdd = sleepDialogDisplayed();
            if(sdd) {
                displaySleepDialog("waitingOnSleepDialog "); }
            return sdd; },
        ackSleepProcDone: function () {
            clearSleepDialog();  //update UI, then verify latest data
            runst.waptmo = setTimeout(wakeupAndPlay,  //fallback retry in case
                                      2400);          //ongoing write/read
            app.pdat.reloadDigDat("ackSleepProcDone", false, function () {
                wakeupAndPlay(); }); },
        updateSleepState: function (src, overrideUIControls) {
            turnSleepOff("dbonly", "updateSleepState clear before set");
            const sst = sleepstate();
            if(overrideUIControls) {
                sst.act = "active";
                sst.cnt = 0; }
            else {  //read control settings from UI
                const scb = jt.byId("sleepactivecb");
                if(src === "changecount") {  //count change implies activation
                    scb.checked = true; }
                sst.act = (scb.checked? "active" : "");
                if(sst.act === "active") {
                    sst.cnt = parseInt(jt.byId("sleepcountsel").value, 10); }
                else {
                    sst.cnt = 0; }
                mgrs.slp.toggleSleepDisplay("close"); }
            updateSleepMainButtonDisplay();
            jt.log("updateSleepState " + JSON.stringify(sst));
            app.deck.replayQueue(); },  //now subject to maxAllowedQueueLength
        toggleSleepDisplay: function (close) {  //show or hide the sleep details
            const sleepdiv = jt.byId("sleepdiv");
            if(close || sleepdiv.style.display !== "none") {
                sleepdiv.innerHTML = "";  //avoid any possible elem side effects
                sleepdiv.style.display = "none";  //note closed
                return; }
            if(!pmso.song) { return jt.log("No sleep before pmso.song avail"); }
            const sst = sleepstate();
            if(sst.act) {  //sleep already activated, show parameter controls
                jt.byId("sleepdiv").style.display = "block";
                showParameterControls(sst); }
            else {  //sleep not active, activate without detail display
                sst.cnt = 0;  //default sleep is after np song finishes
                sst.act = "active";
                mgrs.slp.updateSleepState("toggleSleepOn",
                                          "overrideUIControls"); } },
        maxAllowedQueueLength: function (songs) {  //songs[0] lp update pending
            var obvr = "";   //obviation reason
            const sst = sleepstate();
            if(!sst.act) {  //not activated, and not resuming from sleep
                return app.player.playQueueMax; }  //return standard max limit
            if(songs.length < sst.cnt + 1) {
                obvr = "playback will end before sleep"; }
            if(sst.lspbs && sst.lspbs !== songs[sst.cnt].path) {
                obvr = "last song before sleep changed"; }
            if(obvr) {
                turnSleepOff("uindb", "slp.maxAQL " + obvr);
                updateSleepMainButtonDisplay();
                return app.player.playQueueMax; }  //return standard max limit
            sst.nppsa = songs[0].path;
            sst.lspbs = songs[sst.cnt].path;
            sst.rempts = new Date().toISOString();
            sst.rempaths = rempathsFromSongs(songs.slice(1, sst.cnt + 1));
            jt.log("slp.maxAQL " + JSON.stringify(sst));
            return sst.cnt + 1; }   //include now playing song in return len
    };  //end mgrs.slp returned functions
    }());


    //user interface utilties
    mgrs.uiu = (function () {
        const pbstates = ["playing", "paused", "ended"];  //"" if unknown
        const reqsrcs = {};  //playback status handling
        var nosongtext = "Starting";
        var lastPSReq = 0;  //most recent playback status request ms
        function adjustFramingBackgroundHeight () {  //match height of panels
            const oh = jt.byId("contentdiv").offsetHeight;  //dflt 736px
            const cmdiv = jt.byId("contentmargindiv");
            cmdiv.style.backgroundSize = "564px " + (oh + 20) + "px"; }
        function updateSongTitleDisplay () {
            var tunesrc = "img/tunefork.png";
            const tuneimg = jt.byId("tuneimg");
            if(tuneimg) {  //might have been lit up, keep what's there
                tunesrc = tuneimg.src; }
            if(pmso.song) {  //no longer starting up, verify default status text
                nosongtext = "No song selected"; }
            jt.out("playertitle", jt.tac2html(
                ["div", {cla:"songtitlediv"},
                 [["div", {id:"playtitlebuttonsdiv"},
                   [["span", {id:"modindspan"}],
                    ["a", {href:"#tuneoptions", title:"Tune Playback Options",
                           id:"tuneopta", onclick:mdfs("cmt.toggleTuningOpts")},
                     ["img", {src:tunesrc, cla:"ptico inv", id:"tuneimg"}]]]],
                  ["span", {id:"playtitletextspan"},
                   app.deck.dispatch("util", "songIdentHTML",
                                     pmso.song, nosongtext)]]])); }
        function logPBHandlerState (src, drsm, pbsh) {
            jt.log(src + " " + drsm + " " + JSON.stringify(pbsh)); }
        function noteUpdatedSongStatus (drsm, pbsh) {
            pmso.drsm = drsm;
            logPBHandlerState("uiu.noteUpdatedSongStatus", drsm, pbsh);
            if(!pbsh.path) {
                pmso.resetPlaceholderControlObject();
                pmso.song = null; }
            else {  //have pbsh.path
                if(pmso.expecting && pmso.expecting.path === pbsh.path) {
                    pmso.expecting = null; } //got expected song status.
                pmso.song = app.pdat.songsDict()[pbsh.path]; }
            pmso.state = pbsh.state;
            updateSongTitleDisplay();
            mgrs.plui.updateTransportControls(pbsh);
            mgrs.slp.notePlayerStateChange(); }
        function clearPBHandlerStateDat (drsm, pbsh) {
            logPBHandlerState("uiu.clearPBHandlerStateDat", drsm, pbsh);
            pbsh.path = "";
            pbsh.state = "";
            pbsh.pos = 0;
            pbsh.dur = 0; }
        function potentiallyStaleLocalData () {
            const logpre = "potentiallyStaleLocalData ";
            if(!pmso.prevst) { return false; }  //no prev state to check against
            const psi = mgrs.plui.pollingStatusInfo();
            if(psi.mode !== "active") { return false; }  //not tracking status
            const pst = pmso.prevst;
            const cst = pmso.currst;
            if(!pst.state && !cst.state) { return false; }  //still no info
            if(!pst.state && (cst.state === "playing" ||
                              cst.state === "paused")) {
                return false; }  //real playback state just established
            //transitioning to state "ended", or to "" from playing/paused
            //always merits a reload.
            if(pst.state === "playing" && cst.state === "playing") {
                if(cst.pos >= pst.pos) {  //moved forward
                    const maxfloat = pst.dur - pst.pos;     //not out of touch
                    if(cst.tresp - pst.tresp < maxfloat) {  //for too long
                        return false; } } }  //should be ok.
            if(pst.state === "playing" && cst.state === "paused") {
                if(cst.pos >= pst.pos &&  //haven't gone backwards
                   cst.pos >= psi.freqms &&  //not near beginning
                   cst.pos <= cst.dur - psi.freqms) {  //not near end
                    return false; } }  //should be ok
            if(pst.state === "paused" && cst.state === "paused") {
                if(cst.pos === pst.pos) {
                    return false; } }  //staying paused is ok
            if(pst.state === "paused" && cst.state === "playing") {
                if(cst.pos <= pst.pos + psi.freqms) {
                    return false; } }  //normal unpause
            jt.log(logpre + "unexpected data or safe time boundary exceeded." +
                   " pst:" + JSON.stringify(pst) +
                   " cst:" + JSON.stringify(cst));
            return true; }
        function reloadUpdatedData (reason) {
            var force = true;  //avoid doing anything with old data
            pmso.prevst = null;  //don't re-ref during data reload (or after)
            const mrr = app.pdat.dbObj().arts;  //most recent app data read
            if(mrr && Date.now() - jt.isoString2Time(mrr).getTime() < 6500) {
                jt.log("reloadUpdatedData not forcing reload over recent read");
                force = false; }
            app.pdat.reloadDigDat(reason, force); }
        function reflectUpdatedStatusInfo (pbsh) {  //playback status handler
            const logpre = "uiu.reflectUpdatedStatusInfo ";
            if(!app.pdat.dbObj()) {  //status is meaningless since no lookup
                clearPBHandlerStateDat("predat", pbsh);
                return noteUpdatedSongStatus("predat", pbsh); } //pre-data
            if(!pbsh.path || !app.pdat.songsDict()[pbsh.path]) {  //unknwn media
                clearPBHandlerStateDat("unkmed", pbsh);  //data not useful
                return noteUpdatedSongStatus("unkmed", pbsh); } //unknown media
            if(!pmso.song) {  //runtime data is up to date but not playing
                jt.log(logpre + "pmso.song initialized from playback status");
                noteUpdatedSongStatus("fndply", pbsh);  //found playing song
                return mgrs.gen.notifySongChanged(pmso.song, pbsh.state); }
            //have pmso.song
            if(pmso.song.path === pbsh.path) {  //same song playing
                noteUpdatedSongStatus("npupd", pbsh);
                if(potentiallyStaleLocalData()) {
                    reloadUpdatedData(logpre + "potentially stale"); } }
            else {  //currently playing song path has changed
                jt.log(logpre + "pmso.song has changed");
                noteUpdatedSongStatus("songchg", pbsh);   //update the UI
                const npsg = app.pdat.songsDict()[pbsh.path];
                mgrs.gen.notifySongChanged(npsg, pbsh.state);
                reloadUpdatedData(logpre + "plat changed song"); } }
        function corruptedStatusData (status) {
            //playback queue finished: status path:"", state:"ended".
            if(!status || typeof status !== "object") {
                jt.log("rcvPBStat non-object status parameter: " + status);
                return "corrupted"; }
            if(pmso.stale && pmso.stale.path === status.path) {
                jt.log("rcvPBStat ignoring stale stat from prev song");
                return "stale"; }
            //empty status.path usually indicates nothing playing yet.
            if(pmso.expecting && !status.path) {
                jt.log("rcvPBStat ignoring empty status, expecting " +
                       pmso.expecting.path);
                return "expecting"; }
            //serious lag between call and return means app was backgrounded
            //and may be processing a previously received callback that is no
            //longer accurate.
            if(Date.now() - lastPSReq > 10*1000) {
                jt.log("rcvPBStat ignoring outdated status");
                return "outdated"; }
            //path without state is used for start/ack status polling.
            //Warn if bad status.state val to help with svc integration dev
            if(status.state && pbstates.indexOf(status.state) < 0) {
                jt.log("rcvPBStat invalid status.state: " + status.state); }
            return ""; }
        function initPlayerUIBaseElements () {
            jt.out("mediadiv", jt.tac2html(
                ["div", {id:"playerdiv"},
                 [["div", {id:"playertitle"},
                   ["div", {cla:"songtitlediv"},
                    [["div", {id:"playtitlebuttonsdiv"},
                      ["span", {id:"modindspan"}]],
                     "Starting"]]],
                  ["div", {id:"playertuningdiv"}],
                  ["div", {id:"audioplayerdiv"},
                   [["div", {id:"audiodiv"}],
                    ["div", {id:"nextsongdiv", title:"Skip To Next Song",
                             onclick:jt.fs("app.player.skip()")},
                     ["img", {src:"img/skip.png",
                              cla:"ptico inv"}]]]]]])); }
    return {
        initialize: function () {
            initPlayerUIBaseElements();
            app.boot.addApresModulesInitTask("adjustFramingBackground",
                                             adjustFramingBackgroundHeight); },
        illuminateAndFade: function (divid, ms) {
            var elem = jt.byId(divid);
            elem.style.backgroundColor = "#FFAB00";
            //adding the classList happens async and can take a while, which
            //delays the backgroundColor set from being rendered.  Separate:
            setTimeout(function () {
                elem.classList.add("bgtransitionfade");
                setTimeout(function () {
                    elem.style.backgroundColor = "transparent"; }, ms);
                setTimeout(function () {
                    elem.classList.remove("bgtransitionfade"); }, ms + 750); },
                       100); },
        updateSongDisplay: function (callerstr) {
            const cto = pmso.cto();  //=== pmso.song but easier to read
            jt.log("uiu.updateSongDisplay " + callerstr + " " + pmso.state +
                   " " + cto.ti + " (" + cto.path + ") al:" + cto.al + " el:" +
                   cto.el + " rv:" + cto.rv + " kws:" + cto.kws);
            updateSongTitleDisplay();
            mgrs.pan.updateControl("al", cto.al);
            mgrs.pan.updateControl("el", cto.el);
            mgrs.rat.adjustPositionFromRating(cto.rv);
            mgrs.kwd.rebuildToggles();
            mgrs.cmt.updateIndicators(); },
        assertValidSong: function (song) {
            const epre = "assertValidSong: ";
            if(!song) {
                throw new Error(epre + "No song provided"); }
            const rfs = ["ti", "ar", "path"];
            rfs.forEach(function (fld) {
                if(!song[fld]) {
                    throw new Error(epre + "Missing required field " +
                                    fld); } });
            song.al = song.al || 49;
            song.el = song.el || 49;
            song.rv = song.rv || 5;
            song.kws = song.kws || ""; },
        //Playback status requests go out via uiu.requestPlaybackStatus and
        //data is returned via uiu.receivePlaybackStatus.  Returned data may
        //be invalid.  Response time varies.  Platforms that drop calls rely
        //on player polling to catch up.
        requestPlaybackStatus: function (srcid, callbackf) {
            //jt.log("uiu.requestPlaybackStatus " + srcid);
            lastPSReq = Date.now();
            reqsrcs[srcid] = {
                contf:callbackf || null,
                tcall:lastPSReq, tresp:0,
                path:"", state:"", pos:0, dur:0};
            app.svc.requestPlaybackStatus(); },
        receivePlaybackStatus: function (status) {
            var reflected = false;
            //platform returned status may contain supplemental call details
            jt.log("uiu.receivePlaybackStatus " + JSON.stringify(status));
            if(corruptedStatusData(status)) {
                jt.log("receivePlaybackStatus rechecking corrupted status " +
                       JSON.stringify(status));
                mgrs.plui.recheckStatus();
                return; }
            //When the Digger interface initializes on a mobile platform,
            //playback may be ongoing from the platform service, and
            //javascript timers may still be hanging around waiting to
            //resume from the last time the webview was active.
            if(Object.keys(reqsrcs).every((key) => reqsrcs[key] === null)) {
                jt.log("uiu.receivePlaybackStatus ignoring unrequested " +
                       JSON.stringify(status));
                return; }
            status.tresp = Date.now();
            pmso.currst = status;
            Object.keys(reqsrcs).forEach(function (key) {
                const pbsh = reqsrcs[key];
                if(pbsh) {  //have pending request to process
                    //jt.log("uiu.receivePlaybackStatus " + key);
                    pbsh.tresp = status.tresp;
                    pbsh.path = status.path || "";
                    pbsh.state = status.state;   //may be "" if no song
                    pbsh.pos = status.pos;
                    pbsh.dur = status.dur;
                    if(!reflected) {
                        reflectUpdatedStatusInfo(pbsh);
                        reflected = true; }
                    if(pbsh.contf) {
                        pbsh.contf(pbsh); }
                    reqsrcs[key] = null; } });  //end request
            pmso.prevst = pmso.currst; }  //note for next receive processing
    };  //end mgrs.uiu returned interface
    }());


    //general top level processing functions
    mgrs.gen = (function () {
        const uichg = [  //fields changeable in the player UI with update funcs
            {fld:"fq", uf:function (val) {
                mgrs.cmt.reflectChangedSongFrequency("fq", val); }},
            {fld:"al", uf:function (val) {
                mgrs.pan.updateControl("al", val); }},
            {fld:"el", uf:function (val) {
                mgrs.pan.updateControl("el", val); }},
            {fld:"kws", uf:function (val) {
                pmso.cto().kws = val;
                mgrs.kwd.rebuildToggles(); }},
            {fld:"rv", uf:mgrs.rat.adjustPositionFromRating},
            {fld:"nt", uf:function (val) {
                pmso.cto().nt = val;
                mgrs.cmt.resetDisplay("gen.uichg"); }}];
        function previewSongDisplay (song, state) {
            //The currently playing song and the playback state do not
            //change until the platform player says so.  In the meantime,
            //the UI needs to update to avoid lag and old data.
            const cs = pmso.song;         //save current values
            const st = pmso.state;
            pmso.song = song;             //temp change to what should display
            pmso.state = state;
            mgrs.uiu.updateSongDisplay("previewSongDisplay");
            //restore the previous state.  If no previous state, keep the
            //preview values since they are about to become real.
            pmso.song = cs || song;
            pmso.state = st || state;
            //update stale and expecting for status message tracking
            pmso.stale = null;
            pmso.expecting = null;
            if(pmso.song && pmso.song.path !== song.path) {
                pmso.stale = pmso.song;   //avoid leftover status returns
                pmso.expecting = song; } }  //avoid empty status returns
    return {
        initializeDisplay: function () {
            jt.log("player.gen.initializeDisplay");
            jt.out("panplaydiv", jt.tac2html(
                [["div", {id:"panplaymousingdiv"},  //drag area
                  [["div", {id:"mediadiv"}, "Nothing to play yet"],
                   ["div", {id:"mediaoverlaydiv", style:"display:none"}],
                   ["div", {id:"impressiondiv"},
                    [["div", {id:"panpotsdiv"},
                      [["div", {cla:"pandiv", id:"alpandiv"}],
                       ["div", {cla:"pandiv", id:"elpandiv"}]]],
                     ["div", {id:"keysratdiv"},
                      [["div", {id:"kwdsdiv"}],
                       ["div", {id:"starsnbuttonsdiv"},
                        [["div", {id:"rvdiv"}],
                         ["div", {id:"playerbuttonsdiv"},
                          [["div", {cla:"playerbdiv"},
                            ["a", {id:"togcommentlink", href:"#togglecomment",
                                   title:"Comment",
                                   onclick:mdfs("cmt.toggleCommentDisplay")},
                             ["img", {id:"togcommentimg", cla:"plbimg inv",
                                      src:"img/comment.png"}]]],
                           ["div", {cla:"playerbdiv"},
                            ["a", {id:"togsharelink", href:"#share",
                                   title:"Share",
                                   onclick:mdfs("cmt.toggleSongShare")},
                             ["img", {id:"togshareimg", cla:"plbimg inv",
                                      src:"img/share.png"}]]],
                           ["div", {cla:"playerbdiv"},
                            [["div", {id:"sleepcntssdiv"}],
                             ["a", {id:"togsleeplink", href:"#sleepafter",
                                    title:"Sleep",
                                    onclick:mdfs("slp.toggleSleepDisplay")},
                              ["img", {id:"togsleepimg", cla:"plbimg inv",
                                       src:"img/sleep.png"}]]]]]],
                         ["div", {id:"sleepdiv", style:"display:none"}]]]]],
                     ["div", {id:"pandragcontdiv"},
                      [["div", {id:"alpandragdiv", cla:"pandragdiv"}],
                       ["div", {id:"elpandragdiv", cla:"pandragdiv"}]]]]]]],
                 ["div", {id:"panplayoverlaydiv", style:"display:none",
                          onclick:mdfs("cmt.closeOverlay", "event")}]])); },
        playSongQueue: function (pwsid, songs) {
            //Set the playback queue to the given songs and start playback
            //of the first song.  If the first song is already playing,
            //platform implementations should preserve play/pause state and
            //current playback position, avoiding any audio interruption.
            //Song.lp *must* be updated (and saved to digdat.json) as
            //playback of each song starts.  The given pwsid must be used
            //when updating songs[0].lp and calling app.pdat.writeDigDat.
            //Subsequent song writes must NOT re-use pwsid, and may write
            //digdat.json independently of the app UI. In other words, first
            //write is from UI, subsequent writes the UI reacts to.
            if(!songs || !songs.length) {
                return jt.log("player.playSongQueue called without songs"); }
            if(mgrs.slp.waitingOnSleepDialog()) {
                return jt.log("player.playSongQueue waiting for sleep ack."); }
            songs = songs.slice(0, mgrs.slp.maxAllowedQueueLength(songs));
            jt.log("player.playSongQueue " + songs.length + " songs[0].ti: " +
                   jt.ellipsis(songs[0].ti, 30));
            previewSongDisplay(songs[0], "playing");
            setTimeout(function () {  //let UI update before calling svc
                app.pdat.dbObj().uilp = new Date().toISOString();
                app.svc.playSongQueue(pwsid, songs); },  //may check pmso.song
                       50); },
        reqUpdatedPlaybackStat: function (contf) {
            //Verify playback status is up-to-date and call back
            const psbc = pmso.song;  //playing song before call
            mgrs.uiu.requestPlaybackStatus("gen.requpd", function (status) {
                if((!psbc && status.path) ||  //no song before but playing now
                   (psbc && psbc.path !== status.path)) {  //song changed
                    const song = app.pdat.songsDict()[status.path];
                    app.player.notifySongChanged(song, status.state); }
                contf(pmso); }); },
        notifySongChanged: function (song, state) {
            const logpre = "player.gen.notifySongChanged ";
            mgrs.uiu.assertValidSong(song);
            if(!app.pdat.dbObj()) {
                return jt.log(logpre + "ignored, no database yet."); }
            pmso.mrscnts = new Date().toISOString();
            pmso.stale = null;          //clear any prior tracking based on
            pmso.expecting = null;      //what was queue driven
            const sd = app.pdat.songsDict();
            const dbsg = sd[song.path];
            if(!dbsg) {  //use foreign song instance for display
                jt.log(logpre + "song not found: " + song.path);
                return mgrs.scm.changeCurrentlyPlayingSong(song, state); }
            //regardless if song changed or not, verify hubsync scheduled
            app.top.dispatch("srs", "syncToHub");
            mgrs.plui.pollingMode("active", "notifySongChanged");
            //take appropriate action depending on current player update state
            if(pmso.song && pmso.song.path === dbsg.path) {
                mgrs.uiu.updateSongDisplay("gen.notifySongChanged");
                pmso.state = state;  //notification provides latest state
                mgrs.slp.notePlayerStateChange();
                if(pmso.drsm !== "fndply") {  //not initializing
                    jt.log(logpre + "ignoring non-change call");
                    return; } }
            mgrs.scm.changeCurrentlyPlayingSong(song, state); },
        skip: function () {
            if(!pmso.song) { return jt.log("No skip since no song"); }
            //On mobiles, the skip button can be unresponsive for several
            //seconds if the music playback service is still setting up.
            //Avoid accidental double skip with an extensive debounce.
            const wms = 4000;  //wait milliseconds for debounce
            const st = Date.now();
            if(pmso.skiptime && ((st - pmso.skiptime) < wms)) {
                return; }  //debounce UI ignore call
            pmso.skiptime = st;
            mgrs.uiu.illuminateAndFade("nextsongdiv", wms);
            setTimeout(function () {  //show button press before processing
                jt.log("Skipping " + pmso.song.path + " " + pmso.song.ti);
                const ww = "skip proc avoid writing stale data";
                app.pdat.reloadDigDat(ww, false, function () {
                    pmso.song = app.pdat.songsDict()[pmso.song.path];
                    mgrs.cmt.bumpCurrentIfTired();  //bump fq value if tired
                    pmso.song.pd = "skipped";
                    mgrs.plui.rezeroPlaybackPosition();
                    app.deck.playNextSong(); }); }, 50); },
        logCurrentlyPlaying: function (prefix) {
            //mobile player updates when playing new song, no separate call.
            prefix = prefix || "";
            if(prefix) { prefix += " "; }
            if(pmso && pmso.song) {  //iOS has opaque paths, so include ti
                jt.log(prefix + "logCurrentlyPlaying: " + pmso.song.path +
                       " " + pmso.song.ti); }
            else {
                jt.log(prefix + "logCurrentlyPlaying: no song"); } },
        listChangedFields: function (sa, sb) {
            const chg = uichg.filter((uic) => sa[uic.fld] !== sb[uic.fld]);
            const chgvals = chg.map((chg) => ({fld:chg.fld, uf:chg.uf,
                                               val:sa[chg.fld]}));
            return chgvals; }
    }; //end mgrs.gen returned functions
    }());


return {
    init: function () {
        mgrs.gen.initializeDisplay();
        //toggle controls are rebuilt after data loads, not needed yet
        Object.entries(mgrs).forEach(function ([name, mgr]) {
            if(mgr.initialize) {
                jt.log("initializing player." + name);
                mgr.initialize(); } }); },
    playSongQueue: mgrs.gen.playSongQueue,
    playQueueMax: 180,  //~9hrs without UI interaction
    nowPlayingSong: function () { return pmso.song; },
    currentPlaybackState: function () { return pmso.state; },
    setPlaybackState: function (state) {
        pmso.state = state;
        if(pmso.currst) { pmso.currst.state = state; }},
    currentPlaybackStatus: function () { return pmso.currst; },
    previousReceivedPlaybackStatus: function () { return pmso.prevst; },
    reqUpdatedPlaybackStat: mgrs.gen.reqUpdatedPlaybackStat,
    notifySongChanged: mgrs.gen.notifySongChanged,
    skip: mgrs.gen.skip,
    logCurrentlyPlaying: mgrs.gen.logCurrentlyPlaying,
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.player, args);
        } catch(e) {
            jt.log("player.dispatch " + mgrname + "." + fname + " " + e +
                   " " + e.stack);
        } }
};  //end of returned functions
}());
