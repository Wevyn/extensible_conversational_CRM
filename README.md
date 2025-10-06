# Extensible backend
Extensible is a voice-first artificial intelligence skin to transform rigid databases into adaptive schemas for enterprise.
Features:
- Uses Voice-AI input for automated backend CRM updates.
- Infers implicit CRM updates based on front-end intelligence (semantic and sentiment analysis); Automated schedule follow-ups, meetings, emails, and ease-of-integration into CRM workflows instantaneously.
- Implements secure and dynamic authentication into different CRM workspaces.
- Adapts and learns existing CRM features.

# Environment
- Server is hosted on vercel, available with the following link: https://extensible-conversational-crm.vercel.app/
- To run locally run the following code in the 'conversational_ai_crm' directory: ``` npm run dev ```

# Files
1. [Backend] CRMConnector.js (/conversational_ai_crm/lib/CRMConnector.js)
- Fetches current CRM workspace attributes and fields from user's Attio CRM.
- Manages different guidance templates for task formatting for the API post.
- Ingests Attio's OpenAPI to manage Records, Users, Objects, Attributes, etc., and prepares JSON restructuring..
- Retrieves current data, linked records (internal CRM management for multiple members of an engineering team, or employees of a division/sector), current date, forbidden fields, etc.
2. [Frontend] AdvancedSpeechRecorder.jsx (/conversational_ai_crm/components/AdvancedSpeechRecorder.jsx)
- Manages buttons, voice-to-text (Chrome webdriver), transcript generation.
- Prepares OAuth for secure authorization and entry into Attio users' workspaces.

# How to Use
**0. Prerequisites:** 
- Users should have an Attio account, typically requires an educational or company email;
- Browser which is accessing Extensible should have mic access enabled.
    - For Chrome:
        - Go to top three vertical dots on the top right of window.
        - Click on 'settings'.
        - Click on 'privacy and security' on the left panel.
        - Click on 'site settings'.
        - Under permissions, select 'microphone'.
        - Observe 'Default Behavior,' and ensure that 'Sites can ask to use your microphone' is *enabled*.
        - Now, when Extensible is deployed, a pop-up will be prompted on the top-left of the screen. Authorize, and enjoy!
          
**1. Get started!**
- Access Vercel deployment of Extensible: https://extensible-conversational-crm.vercel.app/
- Click on the settings button on the top right.
- Click 'continue with Attio' --> This will prompt a pop-up! If you do not see the pop-up, you can check on the right of the Chrome search bar, which should have a Desktop icon. Click on this icon, which should manually open the popup.
- Select the Attio workspace you would like to edit from the dropdown. (It is advised to create an empty testing workspace on Attio to get a feel for Extensible before modifying existing workspaces directly).
- Select 'Confirm'.
- Access the main Extensible deployment again, after about ~2-30 seconds, the top left button should turn from red to green and display 'Attio Connected'.
    - This action should now make the mic button in the center clickable!
    - **Important** After authorizing the Attio workspace and seeing the top left button display 'Attio Connected' **wait** for the top right message to change from 'Initializing CRM' to 'CRM Ready'. This should be fully initialized to ensure the smoothese usage.
      
**2. How to use!**
- After the 'CRM Ready' message has been displayed, click the mic. This should turn the button into a red pulsing animation.
- The trigger words for Extensible to start capturing content are 'Initiate CRM'. Please note that we are adding support for more variations of this phrase, but for now this phrase is the only accepted entry into the Extensible platform.
- After 'initiate CRM' is said, the top right console-log should display *Capturing CRM Content*.
- After you are done recording, click the mic button again, which should display another log: *Analyzing the conversation with AI*.
- That's it!

**Troubleshooting**
- Sometimes, when toggling between the capture and close features of the mic button, the application encounters bugs. Usually, reloading the page will resolve this issue and maintain the session login.
- If Extensible encounters a problem mid-conversation, which forces it to terminate the conversation abruptly, it will cancel the post API to ensure that no corrupt data is sent to the CRM backend.
- For any other challenges, feel free to email azadityalakshmi@gmail.com or saranchockalingam@gmail.com.

# Tech Stack
1. Front-end: Next.js
2. Backend: Groq API calls, llama-3.3-70B-versatile, Attio OpenAPI ingestion.
3. Deployment: Vercel, Convex (WIP).

