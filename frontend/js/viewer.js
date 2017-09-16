/// Javascript to render the personal bests on the channel page

var games
var title
var theme
var srcID


/// TODO option to omit subcategory labels?

var pbList = new Array()

window.Twitch.ext.onAuthorized(function(auth) {

    console.log('The JWT that will be passed to the EBS is', auth.token);
    console.log('The channel ID is', auth.channelId);

    $(".frameWrapper").append(
        `<section class="spinnerWrapper">
          <div class="spinner">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </section>`
    )

    $.ajax({
        type: "POST",
        url: "https://extension.xtvaser.xyz/fetch",
        headers: {
          'x-extension-jwt': auth.token,
        },
        dataType: "json",
        data: {},
        success: function (res) {
           console.log('Success\nResponse Code:' + res.status + '\nMessage: ' + res.message);
           games = JSON.parse(res.data.games)
           title = res.data.title
           theme = res.data.theme
           srcID = res.data.srcID
           // First we will get all the runner's personal bests
           $.ajax({
               url: "https://www.speedrun.com/api/v1/users/" + srcID + "/personal-bests",
               dataType: "jsonp",
               jsonpCallback: "getPersonalBests"
           });
        },
        error: function () {
            // no object or something, so need to output something
            console.log('Error');
        }
    });
});

var asyncLoop = function(o){
    var iter = -1
    var length = o.length

    var loop = function(){
        iter++
        if (iter == length) {
            o.callback();
            return;
        }
        o.functionToLoop(loop, iter)
    }
    loop();
}

function getPersonalBests(json) {

    personalBests = json.data
    asyncLoop({
        length: personalBests.length,
        functionToLoop: function(loop, iter) {
            // NOTE can get rank pb.place
            run = personalBests[iter].run
            // If this is one of the games that should be tracked
            index = games.findIndex(x => x.id === run.game)
            if (index > -1) {
                // If this is the first game there, init the spot
                if (pbList[run.game] == null) {
                    pbList[run.game] = new Array()
                }
                pbList[run.game].push({
                    gameId: run.game, // laziness, but with good intentions
                    categoryID: run.category,
                    categoryName: null,
                    categoryLink: null,
                    subcategoryID: null, // may not exist, will leave null if that is the case
                    subcategoryVal: null, // may not exist, will leave null if that is the case
                    variables: run.values, // We have no guarantee which variables are subcategories or not until we check
                    pbTime: run.times.primary_t,
                    pbLink: run.weblink,
                    wrLink: null,
                    wrTime: null,
                    isLevel: run.level != null,
                    rank: personalBests[iter].place
                })
            }
            loop()
        },
        callback: function() {
            // We will get the category link first then
            getCategories()
        }
    })
}

var deferreds = []
function getCategoryName(url, currentPBEntry) {
    deferreds.push($.getJSON(url + "?callback=?", function(json) {
        category = json.data
        currentPBEntry.categoryName = category.name
        currentPBEntry.categoryLink = category.weblink
    }))
}

function getCategories() {
    gameIDs = Object.keys(pbList)
    categoryAPILink = "https://www.speedrun.com/api/v1/categories/"
    for (var i = 0; i < gameIDs.length; i++) {
        for (var j = 0; j < pbList[gameIDs[i]].length; j++) {
            currentPBEntry = pbList[gameIDs[i]][j]
            getCategoryName(categoryAPILink + currentPBEntry.categoryID, currentPBEntry)
        }
    }
    // Then the variable link to fully construct the category link
    $.when.apply(null, deferreds).done(function() {
            getSubcategories()
            deferreds = [] // clear ready for next group of calls
    });
}

function examineVariables(url, currentPBEntry) {

    deferreds.push($.getJSON(url + "?callback=?", function(json) {
        variables = json.data
        for (var i = 0; i < variables.length; i++) {
            if (variables[i]["is-subcategory"] == true &&
                variables[i].id in currentPBEntry.variables) {

                // Then its the right subcategory, grab it's label and such
                currentPBEntry.subcategoryID = variables[i].id
                currentPBEntry.subcategoryVal = currentPBEntry.variables[currentPBEntry.subcategoryID]

                // Find the value now with the subcategoryVal
                currentPBEntry.categoryName += " - " + variables[i].values.values[currentPBEntry.subcategoryVal].label
            }
        }
    }))
}

function getSubcategories() {
    gameIDs = Object.keys(pbList)
    variableAPILink = "https://www.speedrun.com/api/v1/categories/"
    for (var i = 0; i < gameIDs.length; i++) {
        for (var j = 0; j < pbList[gameIDs[i]].length; j++) {
            currentPBEntry = pbList[gameIDs[i]][j]
            examineVariables(variableAPILink + currentPBEntry.categoryID + "/variables", currentPBEntry)
        }
    }
    // Finally, get the WR's information
    $.when.apply(null, deferreds).done(function() {
            getWorldRecords()
            deferreds = [] // clear ready for next group of calls
    });
}

function examineWorldRecordEntry(url, currentPBEntry) {
    deferreds.push($.getJSON(url + "&callback=?", function(json) {
        wr = json.data
        // Guaranteed to a be wr as we only check categories that streamer has done
        // a run of, which means there is atleast one (theres)
        currentPBEntry.wrLink = wr.runs[0].run.weblink
        currentPBEntry.wrTime = wr.runs[0].run.times.primary_t
    }))
}

function getWorldRecords() {
    gameIDs = Object.keys(pbList)
    // format for api link                          v if not null v
    //.../gameid/category/categoryid?top=1&var-subcategoryid=subcategoryvalue
    for (var i = 0; i < gameIDs.length; i++) {
        for (var j = 0; j < pbList[gameIDs[i]].length; j++) {
            currentPBEntry = pbList[gameIDs[i]][j]
            // Construct API Request
            requestURL = `https://www.speedrun.com/api/v1/leaderboards/${currentPBEntry.gameId}/category/${currentPBEntry.categoryID}?top=1`
            if (currentPBEntry.subCategoryID != null) {
                requestURL += `&var-${currentPBEntry.subCategoryID}=${currentPBEntry.subcategoryVal}`
            }
            if (currentPBEntry.isLevel == false) {
                examineWorldRecordEntry(requestURL, currentPBEntry)
            }
        }
    }
    // Now we can finally render the contents of the panel
    $.when.apply(null, deferreds).done(function() {
            renderPersonalBests()
            deferreds = [] // clear ready for next group of calls
    });
}

$(document).on('click', '.gameTitle', function(e) {
    id = e.currentTarget.id.substring(1)
    $('#pbRow' + id).slideToggle('fast');
});

/// Renders the Panel with the given settings
function renderPersonalBests() {

    // Disable the spinner
    $('.spinnerWrapper').remove();

    // TODO css theme selection

    // Begin Creating the Title Header
    $(".frameWrapper").append(
        `<div class="titleContainer outlineText">
        </div>`
    )

    // Add the Title
    $(".titleContainer").append(
        `<div class="row center">
            <h1 id="viewerPanelTitle">${title}</h1>
        </div>`
    )

    // Add the Headers
    $(".titleContainer").append(
        `<div class="row" id="headers">
            <div class="col-6-10">
                <h3>Category</h3></div>
            <div class="col-2-10 center">
                <h3>PB</h3></div>
            <div class="col-2-10 center">
                <h3>WR</h3>
            </div>
        </div>
        <br class="clear" />`
    )

    // Visual Spacer
    $(".frameWrapper").append(
        `<div class="fancyStripeGreen"></div>`
    )

    // Adding Games and PBs
    // Loop through every Game
    gameIDs = Object.keys(pbList)
    for (var i = 0; i < gameIDs.length; i++) {
        // Games are already in order
        currentGame = pbList[gameIDs[i]]
        gameName = games[i].name
        // Add Game Name / Collapsable button
        $(".frameWrapper").append(
            `<div class="gameTitle outlineText" id="g${i}">
                <div class="col-8-10">
                    <h2>${gameName}</h2>
                </div>
                <div class="col-2-10 center">
                    <i class="fa fa-plus-square-o fa-2x" aria-hidden="true"></i>
                </div>
                <br class="clear" />
            </div>
            <div class="fancyStripeBlue"></div>`
        )
        pbHTML =
        `<div class="pbContainer">
            <div class="row">
                <div class="pbRow outlineText" id="pbRow${i}">
                    <ul>`

        // Sort the Games by their names
        currentGame.sort(dynamicSort("categoryName"))
        // Get all the Personal Bests now
        for (var j = 0; j < currentGame.length; j++) {

            pb = currentGame[j]
            // Skip ILs
            if (pb.isLevel == true) {
                continue
            }
            // TODO straight up links through CORS errors on twitchs end
            // so open in a new tab....but that prevent the links from being clickable...?
            pbHTML +=
            `<li>
                <div class="col-6-10 truncate"><a class="categoryName" href="${pb.categoryLink}" target="_blank" title="${pb.categoryName}">${pb.categoryName}</a></div>
                <div class="col-2-10 rightAlign"><a class="pbTime" href="${pb.pbLink}" target="_blank">${secondsToTimeStr(pb.pbTime)}</a></div>
                <div class="col-2-10 rightAlign"><a class="wrTime" href="${pb.wrLink}" target="_blank">${secondsToTimeStr(pb.wrTime)}</a></div>
            </li>`
        }
        pbHTML +=`</ul></div></div></div>`

        // Add to the panel
        $(".frameWrapper").append(pbHTML)
    }
}

function secondsToTimeStr(seconds) {
    minutes = parseInt(seconds / 60)
    seconds = ("0" + seconds % 60).slice(-2);
    hours = ("0" + parseInt(minutes / 60)).slice(-2);
    minutes = ("0" + minutes % 60).slice(-2);
    return `${hours}:${minutes}:${seconds}`
}

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

/// Unused atm, because twitch's handler is what we actually need
$(document).ready(function() {

    // Maybe add a spinner until something is loaded in
})
