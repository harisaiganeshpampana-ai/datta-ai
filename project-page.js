// ================================================================
//  DATTA AI — project-page.js
//  This file is now a thin compatibility shim.
//  All real project logic lives in projects.js (DattaProjects API)
//  Keep this file in your repo so existing <script> tags don't break.
// ================================================================

(function(){
  'use strict';

  // openProjectPage → delegates to projects.js openProjectPanel
  window.openProjectPage = function(id) {
    if (typeof window.openProjectPanel === 'function') {
      window.openProjectPanel(id);
    }
  };

  // Compatibility alias
  window.showNewProjectModal = window.showNewProjectModal || function(){
    console.warn('projects.js not loaded yet');
  };

})();
