This is a document for things a keyboard checker needs to understand.

# Background knowledge

* Font licensing  
  * Need to understand how to see the license  
  * Needs to be an expressly Open license. It can’t just say “free to everyone” or “freeware” or even empty. OFL, GPL, MIT,   
* Unicode and encoding issues PUA, custom-encoded, etc  
* Language tagging and script/language issues like ISO 639-3 and ISO 15924  
* Keyman langtags often contributes info to langtags.  
  * If a language has a different script in a keyboard, submit that to langtags  
  * We don’t accept [ISO 639-5 codes](https://en.wikipedia.org/wiki/ISO_639-5) (collective languages)  
  * Do not use the [numeric regional codes](https://www.unicode.org/cldr/charts/latest/supplemental/territory_containment_un_m_49.html)  
    * 001 doesn't make sense, ever.  
    * 035 / 030 (subparts of Asia) only make sense, possibly, in a contrastive sense `nan-Latn-035` versus some other `nan-Latn`.  
    * Same with 419 \- is there some other `bvv-` that `bvv-419` is contrasting with?  
* Often have to either teach contributors about Github, pull requests, or sometimes fix it up and submit on their behalf.  
* Any time a file is modified that is part of the keyboard package, the keyboard version must be bumped. If a file is not part of a package the version doesn’t need bumping. For example, [README.md](http://README.md), [HISTORY.md](http://HISTORY.md), keyboard.php are all files that aren’t part of a package and if those are the only thing modified, the version doesn’t need modification.   
* Fonts that are committed to release/shared automatically get deployed to [s.keyman.com](http://s.keyman.com). That is not true for any fonts that go into local folders (including the experimental section). They will need adding to [s.keyman.com](http://s.keyman.com) through pull requests. We do not want a lot of local fonts if they are used by more than one keyboard because that means we could have different versions of fonts being installed and we want to maintain continuity.

# Keyboard checking

* Do not trigger an online build until all the following steps have been taken (and fixed in the Pull Request).  
* Make sure all the files are in the right location (not in the root of the repo, etc)  
  * especially important for an initial keyboard submission  
  * under release (normally) or experimental (if seeking initial feedback, if documentation is pending, etc.), then under an organizing folder (usually a single alphabetic letter, or else an organization code)  
* Make sure no files have been changed that are not part of this keyboard submission.  
  * For example, sometimes people change the [build.sh](http://build.sh) or [README.md](http://README.md) in the root of the repo.  
* I always pull the PR to my machine for new keyboard authors and do a thorough check of all the below steps.   
  * If that PR is good or mostly good, I may just check subsequent PRs online.  
  * If that PR is not good and needs a lot of hand-holding I will continue to do thorough local testing for that author.  
* Look at \`HISTORY.md\` \- does it make sense, have a good header, etc. Does the version match what’s in the .kmn file?   
  * Strong recommendation to have the most recent change at the top of the file.   
  * Version numbers should be two or three decimal numbers separated by full stops (1.0 or 1.0.1 or 2.2.5, etc). None of the three numbers should have a leading zero (so 1.01 is not good; it's equivalent to 1.1 but may be confused with 1.0.1. 1.01 is a larger version number than 1.0.2).   
  * When revising a keyboard, if the version number is not changed to a higher version number, the system won't build and deploy the keyboard.  
  * No other formats (such as v2025-04-01 or v1.0-beta) allowed\!   
* Look at LICENSE.md \- does it have the correct copyright statement with year(s)? If they claim copyright on behalf of an organization they aren’t part of, sometimes I tell them they don’t have to attribute copyright to that organization. They can copyright to themselves or a legal entity. If it is copyright to a known organization, make sure the current legal name of that organization is used (not an outdated or former name).  
  * Copyright statement must follow an exact syntax or the build system will not work:  
    * Copyright © year copyright holder  
* README.md \- does it have a good header?   
  * Ask them to remove the version number and the year on the copyright statement if there so that does not have to continually be updated.   
  * Does the description make sense?   
  * Add a link to the keyboard home and help pages.   
    * Home: [https://keyman.com/keyboards/file\_name](https://keyman.com/keyboards/file_name)  
    * Help: http://help.keyman.com/keyboard/file\_name  
  * Do the targets match what’s in the .kmn?  
* Documentation  
  * Go into source/ folder and check readme.htm. This file should be a very short file that has a short description. It is what shows up when you first start to install a .kmp.  
  * Go into source/ folder and check welcome.htm. This file should describe how to use the keyboard. (This file provides the help information packaged with the keyboard, in contrast to the .php file below.) This file will show up after you hit install on the .kmp. It is also available on the help menu for the keyboard in Keyman Configuration.  
  * It can use keyboard image graphics, or tables, or a written description such as (for example): **' \+ a produces á (works for aAeEoO)**.   
  * Documentation should not include information on how to install Keyman or the keyboard package. That kind of information is already available on the Keyman site and changes periodically so we don’t want to have to update it in all the keyboard packages.  
  * Check that content isn’t too political or self-promoting  
* Then:  
  * Open the .kpj file and select the **Keyboards** tab and the .kmn. Check that the kmn version matches what was in HISTORY.md  
    * Look at the rules? If this keyboard includes PUA characters it belongs in the experimental section. Require that the documentation makes it clear the characters (or script) are not in Unicode.  
    * Look at the OSK.  
    * Will they need a font to display the characters? If so, the font should be selected in the OSK.  
    * Look at the touch layout. Is there both a phone and tablet? If they match, request the author to remove one of them since it creates unnecessary work to maintain two exact keyboards. Check that the same font is selected.  
    * Compile the keyboard and make sure there are no errors.  
  * Go to the **Packaging** tab and open the .kps file.   
    * Are all needed files included? Are no unnecessary files included?  
      * All the compiled files:  
        * .kmx (from .kmn and .ico (or .bmp))  
        * .kvk (from .kvks)  
        * .js (from .keyman-touch-layout), but only if there's a mobile layout (Double-check the targets in the .kmn to see if the files match what the target says.)  
      * LICENSE.md, readme.htm, welcome.htm (and any associated graphics files)  
      * Any fonts that are required (hopefully from the shared/fonts folder). It’s best to add all the typefaces (not just Regular) so the user has them available.  
        * Double-check that the font is licensed for free distribution. OFL is best. GNU, CC, MIT is okay.   
        * Freeware is not okay.  
        * An empty license field is not acceptable.  
        * Do NOT let them include any industry fonts such as Arial, Times, Tahoma, etc.  
      * DO NOT include the .php help file or any files from the help folder  
      * DO NOT include the uncompiled files (.kmn, .ico, .kvks, .keyman-touch-layout, .kps)  
    * Go to Keyboards tab   
      * Choose the font if a font is included in the Files  
      * Choose the language tag(s). This should always be selected, but it is mandatory for installing touch layouts. They should be the minimal tag(s) if possible  
      * If they have a new/unusual tag, consider adding it to langtags and possibly Ethnologue  
        * Also consider whether that tag is correct. This would need special review if the keyboard is for a conlang or if the tag includes numeric regional codes.  
    * Go to Details tab  
      * Make sure readme.htm, welcome.htm, LICENSE.md are selected.  
      * Make sure follow keyboard version is selected  
      * Make sure there is a good description. All of that will be on the keyboard home page.  
* Go into the source/help folder and check that the .php file is correct. (This file provides the help information available online, in contrast to the welcome.htm file above.) It should have the proper php header. If using the osk syntax, make sure that all the desktop and mobile layers are selected. This generally requires going back and looking in the OSK and in the touch layout code to see what needs to be displayed.  
  * Style information should be within the .php header and not outside the header. Further documentation is here: [https://help.keyman.com/developer/keyboards/phphelpfile](https://help.keyman.com/developer/keyboards/phphelpfile)  
* Once everything has been checked, there are no extraneous files, etc, and the keyboard compiles locally, AND the keyboard author has resolved the issues in the Pull Request, THEN you can trigger a build on Team City.   
  * The build does sometimes find things that I don’t find in my checking. For example, the format of the copyright in [LICENSE.md](http://LICENSE.md), if [LICENSE.md](http://LICENSE.md) is not included in the .kps, etc.

# Obscure issues

* Make sure the ID (foldername) hasn’t been used elsewhere. Check experimental, legacy, and release  
* Too many rules (If the kmn takes a long time to compile it could be a problem)  
* Keyboards using PUA codepoints always belong in /experimental. Add lots of notices about using PUA codepoints (in the descriptions of the readme.htm, welcome.htm, help file and .kps description.  
* Keyboards for unencoded scripts that reuse codepoints (for example putting characters on Arabic codepoints) need a lot of thought and we probably don’t want that keyboard in our repo. If we accept it, it needs lots of warnings as per the files listed under PUA codepoints.  
* BCP47 tag  
  * Using the wrong BCP47 tag  
  * Conlangs are complicated  
  * Using numeric regional codes could be an issue. We need to discuss further after the Keyman team figures out some issues with Windows.  
* Spoofing  
  * If they use mathematical Latin-looking characters they may be trying to create a keyboard for spoofing  
* Someone wants to modify an existing keyboard from the original author’s intent.   
  * If an unrelated third party submits a patch for a keyboard we should be very careful with accepting it \-- even minor modifications can be a problem. Ideally, seek approval from original author  
* Deprecating keyboards  
  * Keyboards in legacy can only be put in release if we get permission from the author to change to the MIT license. In that case, we may want to rename the keyboard so it conforms to a better naming convention. We would want to deprecate the keyboard in legacy with the new keyboard in release.  
    * Create the new keyboard  
    * In the .kps file, on the **Details** tab, choose **Related packages / Add**, type in the package ID for the keyboard in legacy, and select **Deprecated**.  
      * This information will tell our build system to put a link on the home page for the new keyboard indicating it deprecates another keyboard. It also “hides” the deprecated keyboard in ways to discourage its use.   
    * Go to the legacy folder and find the keyboard you are deprecating. Create a [DEPRECATED.md](http://DEPRECATED.md) file with a sentence similar to this:  
      "This keyboard has been deprecated and replaced by release/<org>/<new\_keyboard\_id>”  
      * This file doesn’t actually do anything in our build system, but this information is useful for developers to know what happened to this keyboard.   
* Additional things to check for partner-organization keyboard / package updates (where a partner maintains a bundled package with its own per-package notes and a separate keyboards manifest used by the iOS app):  
  * Check the partner package's "note for keyboard maintainers" in its package folder under `release/packages/`  
  * Update keyboard versions in the partner's `keyboards.csv` under the `oem/` folder of the Keyman repo (for iOS app)   
* **Fonts**: When an experimental keyboard with a font (such as PUA encoding) is getting ready to be approved. You have to submit that font to [s.keyman.com](http://s.keyman.com) so that the online web and help files will be able to display.

## Users

Contributor A

* I have not tried to teach them how to use a branch. They use master. I told them they could only submit one keyboard at a time. If they use master it helps them not submit too many keyboard PRs at one time.  
* I have told them they must submit keyboard to experimental from now on. Besides the PRs being a bit messy sometimes, this is also because the keyboards are in general not good keyboards.