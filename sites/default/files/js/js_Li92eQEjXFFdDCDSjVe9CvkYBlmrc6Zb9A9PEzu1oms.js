var ManualCrop = { croptool: null, oldSelection: null, widget: null, output: null, loadErrorShown: false };

(function ($) {

/**
 * Initialize the Manual Crop widgets within a context.
 *
 * @param context
 *   Current context as DOM object.
 */
ManualCrop.init = function(context) {
  var elements = Drupal.settings.manualcrop.elements;

  // Add a css class to the select options of required crop styles.
  for (var identifier in elements) {
    var required = elements[identifier].required;

    $('.manualcrop-identifier-' + identifier, context).once('manualcrop-init', function() {
      for (var k in required) {
        $('option[value="' + required[k] + '"]', this).addClass('manualcrop-style-required');
      }
    });
  }

  // Trigger the change event of the crop data storage fields to set all css
  // classes for the crop lists/buttons and to update the default image
  // so it reflects the cropped image.
  $('.manualcrop-cropdata', context).once('manualcrop-init', function() {
    $(this).trigger('change');
  });

  // Blur the buttons on mousedown.
  $('.manualcrop-button', context).once('manualcrop-init', function() {
    $(this).mousedown(function() {
      this.blur();
    });
  });

  // If the user isn't using a mobile device (screen width should be > 767), the
  // crop tool should be opened when a new file gets uploaded and "crop after upload"
  // has been enabled in the settings.
  if (screen.width > 767) {
    $('.ajax-new-content', context).once('manualcrop-init', function() {
      var content = $(this);

      if (!content.html().length) {
        // If the $form['#file_upload_delta'] is not set or invalid the file module
        // will add an empty <span> as .ajax-new-content element, so we need the
        // previous element to execute the after upload function.
        content = content.prev();
      }

      if ($('.manualcrop-cropdata', content).length == 1) {
        for (var identifier in elements) {
          if (elements[identifier].instantCrop) {
            $('.manualcrop-style-button, .manualcrop-style-thumb', content).trigger('mousedown');
          }
        }
      }
    });
  }

  // Trigger the init handler if a Media modal was opened.
  $('.modal-content', context).once('manualcrop-init', function() {
    $(this).ready(function() {
      ManualCrop.init(this);
    });
  });
}

/**
 * Open the cropping tool for an image.
 *
 * @param identifier
 *   Unique form element settings identifier.
 * @param style
 *   The image style name or selection list triggering this event.
 * @param fid
 *   The file id of the image the user is about to crop.
 */
ManualCrop.showCroptool = function(identifier, style, fid) {
  var styleName, styleSelect, cropType, origContainer, conWidth, conHeight;

  if (ManualCrop.croptool) {
    // Close the current croptool.
    ManualCrop.closeCroptool();
  }

  // Get the style name.
  if (typeof style == 'string') {
    styleName = style
  }
  else {
    styleSelect = $(style);
    styleName = styleSelect.val();
  }

  ManualCrop.isLoaded('.manualcrop-file-' + fid + '-holder', function() {
    // IE executes this callback twice, so we check if the ManualCrop.croptool
    // has already been set and skip the rest if this is the case.
    if (!ManualCrop.croptool) {
      // Determine the croptool type.
      if ($('#manualcrop-overlay-' + fid).length == 1) {
        cropType = 'overlay';
        origContainer = $('#manualcrop-overlay-' + fid);
      }
      else {
        cropType = 'inline';
        origContainer = $('#manualcrop-inline-' + fid);
      }

      // Get the settings.
      var styleSettings = Drupal.settings.manualcrop.styles[styleName] || null;
      var elementSettings = Drupal.settings.manualcrop.elements[identifier] || null;

      // Get the destination element and the current selection.
      ManualCrop.output = $('#manualcrop-area-' + fid + '-' + styleName);
      ManualCrop.oldSelection = ManualCrop.parseStringSelection(ManualCrop.output.val());

      // Create the croptool.
      ManualCrop.croptool = origContainer.clone()
        .removeAttr('id')
        .removeClass('element-hidden');

      // Get the container maximum width and height.
      if (cropType == 'overlay') {
        conWidth = $(window).width();
        conHeight = $(window).height();
      }
      else {
        conWidth = origContainer.parent().innerWidth();
        conHeight = $(window).height();
      }

      // Tool width and height.
      ManualCrop.croptool.css('width', conWidth + 'px');

      if (cropType == 'overlay') {
        ManualCrop.croptool.css('height', conHeight + 'px');
      }

      // Get the image and its dimensions.
      var image = $('.manualcrop-image', origContainer);
      var dimensions = ManualCrop.getImageDimensions(image);

      // Scale the image to fit the maximum width and height (so all is visible).
      var maxWidth = conWidth - ManualCrop.parseInt(image.css('marginLeft')) - ManualCrop.parseInt(image.css('marginRight'));
      var maxHeight = conHeight - ManualCrop.parseInt(image.css('marginTop')) - ManualCrop.parseInt(image.css('marginBottom'));

      // Calculate the clone image dimensions.
      var resized = ManualCrop.resizeDimensions(dimensions.width, dimensions.height, maxWidth, maxHeight);

      // Set the new width and height to the cloned image.
      image = $('.manualcrop-image', ManualCrop.croptool)
        .css('width', resized.width + 'px')
        .css('height', resized.height + 'px');

      // Basic imgAreaSelect options; All options are set - also if it's their
      // default value - because IE doesn't seem to use the default values.
      var options = {
        handles: true,
        instance: true,
        keys: (!elementSettings || elementSettings.keyboard),
        movable: true,
        resizable: true,
        parent: image.parent(),
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        onSelectChange: ManualCrop.updateSelection
      };

      // Additional options based upon the effect.
      if (styleSettings) {
        switch (styleSettings.effect) {
          // Crop and scale effect.
          case 'manualcrop_crop_and_scale':
            options.aspectRatio = styleSettings.data.width + ':' + styleSettings.data.height;

            if (styleSettings.data.respectminimum) {
              // Crop at least the minimum.
              options.minWidth = ManualCrop.parseInt(styleSettings.data.width);
              options.minHeight = ManualCrop.parseInt(styleSettings.data.height);
            }
            break;

          // Crop effect.
          case 'manualcrop_crop':
            if (styleSettings.data.width) {
              options.minWidth = ManualCrop.parseInt(styleSettings.data.width);
            }

            if (styleSettings.data.height) {
              options.minHeight = ManualCrop.parseInt(styleSettings.data.height);
            }

            if (typeof styleSettings.data.keepproportions != 'undefined' && styleSettings.data.keepproportions) {
              options.aspectRatio = styleSettings.data.width + ':' + styleSettings.data.height;
            }
        }
      }

      // Set the image style name.
      $('.manualcrop-style-name', ManualCrop.croptool).text(styleName);

      if (typeof styleSelect != 'undefined') {
        // Reset the image style selection list.
        styleSelect.val('');
        styleSelect.blur();
      }
      else {
        // Hide the crop button.
        $('.manualcrop-style-button-' + fid).hide();
      }

      // Append the cropping area (last, to prevent that "_11" is undefined).
      if (cropType == 'overlay') {
        $('body').append(ManualCrop.croptool);
      }
      else {
        origContainer.parent().append(ManualCrop.croptool);
      }

      // Put our overlay on top.
      if (cropType == 'overlay') {
        var overlayContainer = $('#overlay-container', top.document);
        if (overlayContainer.length) {
          overlayContainer
            .addClass('manualcrop-tweaked')
            .data('old-z-index', overlayContainer.css('z-index'))
            .css('z-index', '1000');
        }
      }

      // Create the crop widget.
      ManualCrop.widget = image.imgAreaSelect(options);

      // IE seems to have some issues with the imgAreaSelect $parent variable,
      // so we set the options again to initialize it correctly.
      if (navigator.userAgent.toLowerCase().indexOf('msie ') != -1) {
        ManualCrop.widget.setOptions(options);
      }

      // Move the selection info into the widget.
      var selectionInfo = $('.manualcrop-selection-info', ManualCrop.croptool);
      if (selectionInfo.length) {
        $('.imgareaselect-selection', ManualCrop.croptool)
          .after(selectionInfo)
          .parent().css('overflow', 'visible');
      }

      // Insert the instant preview image.
      var instantPreview = $('.manualcrop-instantpreview', ManualCrop.croptool);
      if (instantPreview.length) {
        // Save the current width as maximum width and height.
        instantPreview
          .data('maxWidth', instantPreview.width())
          .data('maxHeight', instantPreview.width())
          .height(instantPreview.width());

        // Calculate the instant preview dimensions.
        resized = ManualCrop.resizeDimensions(dimensions.width, dimensions.height, instantPreview.width(), instantPreview.width());

        // Set those dimensions.
        image.clone().appendTo(instantPreview)
          .removeClass()
          .css('width', resized.width + 'px')
          .css('height', resized.height + 'px');
      }

      if (!ManualCrop.oldSelection) {
        // Create a default crop area.
        if (elementSettings && elementSettings.defaultCropArea) {
          if (elementSettings.maximizeDefaultCropArea) {
            ManualCrop.isLoaded(ManualCrop.croptool, ManualCrop.maximizeSelection);
          }
          else {
            var minWidth = (typeof options.minWidth != 'undefined' ? options.minWidth : 0);
            var minHeight = (typeof options.minHeight != 'undefined' ? options.minHeight : 0)

            // Set a width and height.
            var selection = {
              width: (minWidth ? minWidth * 100 : (width / 2)),
              height: (minHeight ? minHeight * 100 : (height / 2)),
              maxWidth: (dimensions.width / 2),
              maxHeight: (dimensions.height / 2)
            };

            // Resize the selection.
            selection = ManualCrop.resizeDimensions(selection);

            // Make sure we respect the minimum dimensions.
            if (minWidth || minHeight) {
              if (minWidth && selection.width < minWidth) {
                selection.width = minWidth;

                if (minHeight) {
                  selection.height = minHeight;
                }
              }
              else if (minHeight && selection.height < minHeight) {
                selection.height = minHeight;

                if (minWidth) {
                  selection.width = minWidth;
                }
              }
            }

            // Center the selection.
            selection.x1 = Math.round((dimensions.width - selection.width) / 2);
            selection.y1 = Math.round((dimensions.height - selection.height) / 2);
            selection.x2 = selection.x1 + selection.width;
            selection.y2 = selection.y1 + selection.height;

            // Set the selection.
            ManualCrop.isLoaded(ManualCrop.croptool, function() {
              ManualCrop.setSelection(selection);
            });
          }
        }
      }
      else {
        // Set the initial selection.
        ManualCrop.isLoaded(ManualCrop.croptool, ManualCrop.resetSelection);
      }

      // Handle keyboard shortcuts.
      if (!elementSettings || elementSettings.keyboard) {
        $(document).keyup(ManualCrop.handleKeyboard);
      }
    }
  });
}

/**
 * Close the cropping tool.
 *
 * @param reset
 *   Set to true to reset the selection before closing.
 */
ManualCrop.closeCroptool = function(reset) {
  if (ManualCrop.croptool) {
    if (reset) {
      ManualCrop.resetSelection();
    }

    ManualCrop.output.trigger('change');

    ManualCrop.widget.setOptions({remove: true});
    ManualCrop.croptool.remove();
    ManualCrop.croptool = null;
    ManualCrop.oldSelection = null;
    ManualCrop.widget = null;
    ManualCrop.output = null;

    // Restore the overlay z-index.
    var overlayContainer = $('#overlay-container.manualcrop-tweaked', top.document);
    if (overlayContainer.length) {
      overlayContainer
        .removeClass('manualcrop-tweaked')
        .css('z-index', overlayContainer.data('old-z-index'));

      $.removeData(overlayContainer, 'old-z-index');
    }

    $('.manualcrop-style-button').show();

    $(document).unbind('keyup', ManualCrop.handleKeyboard);
  }
}

/**
 * Reset the selection to the previous state.
 */
ManualCrop.resetSelection = function() {
  if (ManualCrop.croptool) {
    if (ManualCrop.oldSelection) {
      ManualCrop.setSelection(ManualCrop.oldSelection);

      // Hide reset button.
      $('.manualcrop-reset', ManualCrop.croptool).hide();
    }
    else {
      ManualCrop.clearSelection();
    }
  }
}

/**
 * Maximize the selection to fill the container as much as possible/allowed.
 */
ManualCrop.maximizeSelection = function() {
  if (ManualCrop.croptool) {
    var image = $('img.manualcrop-image', ManualCrop.croptool);

    // Get the original width and height.
    var dimensions = ManualCrop.getImageDimensions(image);
    var options = ManualCrop.widget.getOptions();

    // Check if the ratio should be respected.
    if (typeof options.aspectRatio != 'undefined' && options.aspectRatio != '') {
      // Get the ratio.
      var ratio = options.aspectRatio.match(/([0-9]+):([0-9]+)/);
      var ratioWidth = ManualCrop.parseInt(ratio[1]);
      var ratioHeight = ManualCrop.parseInt(ratio[2]);

      // Crop area defaults.
      var width = dimensions.width;
      var height = dimensions.height;
      var x = 0;
      var y = 0;

      if ((ratioWidth / ratioHeight) > (dimensions.width / dimensions.height)) {
        // Crop from top and bottom.
        height = Math.floor((width / ratioWidth) * ratioHeight);
        y = Math.floor((dimensions.height - height) / 2);
      }
      else {
        // Crop from sides.
        width = Math.floor((dimensions.height / ratioHeight) * ratioWidth);
        x = Math.floor((dimensions.width - width) / 2);
      }

      // Set the new selection.
      ManualCrop.setSelection(x, y, (x + width), (y + height));
    }
    else {
      // No ratio requirements, just select the whole image.
      ManualCrop.setSelection(0, 0, dimensions.width, dimensions.height);
    }
  }
}

/**
 * Set a selection.
 *
 * @param x1
 *   Left top X coordinate or a selection object with all parameters.
 * @param y1
 *   Left top Y coordinate.
 * @param x2
 *   Right bottom X coordinate.
 * @param y2
 *   Right bottom Y coordinate.
 */
ManualCrop.setSelection = function(x1, y1, x2, y2) {
  if (typeof x1 == 'object') {
    var selection = x1;
  }
  else {
    var selection = {};
    selection.x1 = x1;
    selection.y1 = y1;
    selection.x2 = x2;
    selection.y2 = y2;
    selection.width = x2 - x1;
    selection.height = y2 - y1;
  }

  if (ManualCrop.croptool) {
    ManualCrop.widget.setSelection(selection.x1, selection.y1, selection.x2, selection.y2);
    ManualCrop.widget.setOptions({hide: false, show: true});
    ManualCrop.widget.update();
    ManualCrop.updateSelection(null, selection);
  }
}

/**
 * Remove the selection.
 */
ManualCrop.clearSelection = function() {
  if (ManualCrop.croptool) {
    ManualCrop.widget.setOptions({hide: true, show: false});
    ManualCrop.widget.update();
    ManualCrop.updateSelection();

    // Hide clear button.
    $('.manualcrop-clear', ManualCrop.croptool).hide();
  }
}

/**
 * When a selection updates write the position and dimensions to the output field.
 *
 * @param image
 *   Reference to the image that is being cropped.
 * @param selection
 *   Object defining the current selection.
 */
ManualCrop.updateSelection = function(image, selection) {
  if (ManualCrop.croptool) {
    var resized;

    // Update the image reference.
    image = $('img.manualcrop-image', ManualCrop.croptool);

    // Get the original width and height.
    var dimensions = ManualCrop.getImageDimensions(image);

    // Get the selection info wrapper.
    var selectionInfo = $('.manualcrop-selection-info', ManualCrop.croptool);

    // Get the instant preview.
    var instantPreview = $('.manualcrop-instantpreview', ManualCrop.croptool);

    if (selection && selection.width && selection.height && selection.x1 >= 0 && selection.y1 >= 0) {
      ManualCrop.output.val(selection.x1 + '|' + selection.y1 + '|' + selection.width + '|' + selection.height);

      // Update and show the selection info.
      if (selectionInfo.length) {
        $('.manualcrop-selection-x', ManualCrop.croptool).text(selection.x1);
        $('.manualcrop-selection-y', ManualCrop.croptool).text(selection.y1);
        $('.manualcrop-selection-width .manualcrop-selection-label-content', ManualCrop.croptool).text(selection.width);
        $('.manualcrop-selection-height .manualcrop-selection-label-content', ManualCrop.croptool).text(selection.height);

        selectionInfo.show();
      }

      // Update the instant preview.
      if (instantPreview.length) {
        // Calculate the instant preview dimensions.
        resized = ManualCrop.resizeDimensions(selection.width, selection.height, instantPreview.data('maxWidth'), instantPreview.data('maxHeight'));

        // Set the new width and height to the preview container.
        instantPreview.css({
          width: resized.width + 'px',
          height: resized.height + 'px'
        });

        // Calculate the resize scale.
        var scaleX = resized.width / selection.width;
        var scaleY = resized.height / selection.height;

        // Update the image css.
        $('img', instantPreview).css({
          width: Math.round(scaleX * dimensions.width) + 'px',
          height: Math.round(scaleY * dimensions.height) + 'px',
          marginLeft: '-' + Math.round(scaleX * selection.x1) + 'px',
          marginTop: '-' + Math.round(scaleY * selection.y1) + 'px'
        });
      }
    }
    else {
      ManualCrop.output.val('');

      // Hide the selection info.
      selectionInfo.hide();

      // Reset the instant preview.
      if (instantPreview.length) {
        instantPreview
          .width(instantPreview.data('maxWidth'))
          .height(instantPreview.data('maxHeight'));

        resized = ManualCrop.resizeDimensions(dimensions.width, dimensions.height, instantPreview.width(), instantPreview.height());

        $('img', instantPreview).css({
          width: resized.width + 'px',
          height: resized.height + 'px',
          marginLeft: '0px',
          marginTop: '0px'
        });
      }
    }

    if (ManualCrop.oldSelection) {
      // Show reset button.
      $('.manualcrop-reset', ManualCrop.croptool).show();
    }

    // Hide clear button.
    $('.manualcrop-clear', ManualCrop.croptool).show();
  }
}

/**
 * A new cropping area was saved to the hidden field, update the default image
 * preview and find the corresponding select option or button and append a css
 * class and text to indicate the crop status.
 *
 * This is a seperate function so it can be triggered after loading.
 *
 * @param element
 *   The hidden field that stores the selection.
 * @param fid
 *   The file id.
 * @param styleName
 *   The image style name.
 */
ManualCrop.selectionStored = function(element, fid, styleName) {
  var selection = $(element).val();

  ManualCrop.isLoaded('.manualcrop-file-' + fid + '-holder', function() {
    var previewHolder = $('.manualcrop-preview-' + fid + '-' + styleName + ' .manualcrop-preview-cropped');
    if (!previewHolder.length) {
      previewHolder = $('.manualcrop-preview-' + fid + ' .manualcrop-preview-cropped');
    }

    var defaultPreview = $('.manualcrop-preview-' + fid + '-' + styleName + ' > img');
    if (!defaultPreview.length) {
      defaultPreview = $('.manualcrop-preview-' + fid + ' > img');
    }

    var toolOpener = $('.manualcrop-style-select-' + fid + " option[value='" + styleName + "'], .manualcrop-style-button-" + fid + ', .manualcrop-style-thumb-' + fid + '-' + styleName + ' .manualcrop-style-thumb-label');
    var hasClass = toolOpener.hasClass('manualcrop-style-cropped');

    if (previewHolder.length && previewHolder.children().length) {
      previewHolder.css({
        width: '0px',
        height: '0px'
      }).html('');
      defaultPreview.css('display', 'block');
    }

    if (selection) {
      if (previewHolder.length) {
        // Get the dimensions of the original preview image and hide it again.
        var maxWidth = ManualCrop.parseInt(defaultPreview.width());
        var maxHeight = ManualCrop.parseInt(defaultPreview.height());

        if (maxWidth > 0) {
          defaultPreview.css('display', 'none');

          // Get the selected crop area.
          selection = ManualCrop.parseStringSelection(selection);

          // Calculate the preview dimensions.
          var resized = ManualCrop.resizeDimensions(selection.width, selection.height, maxWidth, maxHeight);

          // Set the new width and height to the cropped preview holder.
          previewHolder.css({
            width: resized.width + 'px',
            height: resized.height + 'px'
          });

          // Calculate the resize scale.
          var scaleX = resized.width / selection.width;
          var scaleY = resized.height / selection.height;

          // Get the original image and its dimensions.
          var originalImage = $('#manualcrop-overlay-' + fid + ' img.manualcrop-image, #manualcrop-inline-' + fid + ' img.manualcrop-image');
          var dimensions = ManualCrop.getImageDimensions(originalImage);

          // Calculate the new width and height using the full image.
          resized.width = Math.round(scaleX * dimensions.width);
          resized.height = Math.round(scaleY * dimensions.height);

          // Create and insert the cropped preview.
          previewHolder.append(originalImage.clone().removeClass().css({
            width: resized.width + 'px',
            height: resized.height + 'px',
            marginLeft: '-' + Math.round(scaleX * selection.x1) + 'px',
            marginTop: '-' + Math.round(scaleY * selection.y1) + 'px'
          }));
        }
      }

      if (!hasClass) {
        // Style has been cropped.
        toolOpener.addClass('manualcrop-style-cropped');

        if (toolOpener.is('input')) {
          toolOpener.val(toolOpener.val() + ' ' + Drupal.t('(cropped)'));
        }
        else {
          toolOpener.text(toolOpener.text() + ' ' + Drupal.t('(cropped)'));
        }
      }
    } else if (hasClass) {
      // Style not cropped.
      toolOpener.removeClass('manualcrop-style-cropped');

      if (toolOpener.is('input')) {
        toolOpener.val(toolOpener.val().substr(0, (toolOpener.val().length - Drupal.t('(cropped)').length - 1)));
      }
      else {
        toolOpener.text(toolOpener.text().substr(0, (toolOpener.text().length - Drupal.t('(cropped)').length - 1)));
      }
    }
  });
}

/**
 * Keyboard shortcuts handler.
 *
 * @param e
 *    The event object.
 */
ManualCrop.handleKeyboard = function(e) {
  if (ManualCrop.croptool) {
    if (e.keyCode == 13) {
      // Enter
      ManualCrop.closeCroptool();
    }
    else if(e.keyCode == 27) {
      // Escape
      ManualCrop.closeCroptool(true);
    }
  }
}

/**
 * Parse a string defining the selection to an object.
 *
 * @param txtSelection
 *   The selection as a string e.a.: "x|y|width|height".
 * @return
 *   An object containing defining the selection.
 */
ManualCrop.parseStringSelection = function(txtSelection) {
  if (txtSelection) {
    var parts = txtSelection.split('|');
    var selection = {
      x1: ManualCrop.parseInt(parts[0]),
      y1: ManualCrop.parseInt(parts[1]),
      width: ManualCrop.parseInt(parts[2]),
      height: ManualCrop.parseInt(parts[3])
    };

    selection.x2 = selection.x1 + selection.width;
    selection.y2 = selection.y1 + selection.height;

    return selection;
  }

  return null;
}

/**
 * Parse a textual number to an integer.
 *
 * @param integer
 *   The textual integer.
 * @return
 *   The integer.
 */
ManualCrop.parseInt = function(integer) {
  return (parseInt(integer) || 0);
}

/**
 * Get the dimensions of an image.
 *
 * @param image
 *   jQuery image selector or object.
 *
 * @return
 *   Object with a width and height property.
 */
ManualCrop.getImageDimensions = function(image) {
  if (typeof image != 'jQuery') {
    image = $(image).first();
  }

  image = image.get(0);

  if (image.naturalWidth && image.naturalHeight) {
    return {
      width: ManualCrop.parseInt(image.naturalWidth),
      height: ManualCrop.parseInt(image.naturalHeight)
    }
  }
  else {
    var rawImage = new Image();
    rawImage.src = image.src;

    if (rawImage.width && rawImage.height) {
      image = rawImage;
    }

    return {
      width: ManualCrop.parseInt(image.width),
      height: ManualCrop.parseInt(image.height)
    }
  }
}

/**
 * Calculate new dimensions based upon a maximum width and height.
 *
 * @param width
 *   The current width or an object width all the properties set.
 * @param height
 *   The current height.
 * @param maxWidth
 *   The maximum width.
 * @param maxHeight
 *   The maximum height.
 * @return
 *   An object with the new width and height as properties.
 */
ManualCrop.resizeDimensions = function(width, height, maxWidth, maxHeight) {
  if (typeof width == 'object') {
    if (typeof width.maxWidth != 'undefined' && width.maxWidth) {
      maxWidth = width.maxWidth;
    }
    else {
      maxWidth = 9999999;
    }

    if (typeof width.maxHeight != 'undefined' && width.maxHeight) {
      maxHeight = width.maxHeight;
    }
    else {
      maxHeight = 9999999;
    }

    height = width.height;
    width = width.width;
  }
  else {
    if (!maxWidth) {
      maxWidth = 9999999;
    }

    if (!maxHeight) {
      maxHeight = 9999999;
    }
  }

  // Calculate the new width and height.
  if(width > maxWidth) {
    height = Math.floor((height * maxWidth) / width);
    width = maxWidth;
  }

  if(height > maxHeight) {
    width = Math.floor((width * maxHeight) / height);
    height = maxHeight;
  }

  return {
    'width': width,
    'height': height
  };
}

/**
 * Execute a callback if one or more images are succesfully loaded.
 *
 * @param selector
 *   jQuery selector or object for one or more images.
 * @param callback
 *   Callback function to execute when all images are loaded.
 */
ManualCrop.isLoaded = function(selector, callback) {
  if (!(selector instanceof jQuery)) {
    selector = $(selector);
  }

  // Collect all images.
  var images = selector.filter('img');
  if (images.length != selector.length) {
    images = images.add(selector.find('img'));
  }

  if (!images.length) {
    // No images found, execute the callback right away.
    callback();
  }
  else {
    images.imagesLoaded(function() {
      // Count the number of images with proper dimensions.
      var hasDimensions = 0;
      images.each(function() {
        var dimensions = ManualCrop.getImageDimensions(this);
        if (dimensions.width && dimensions.height) {
          hasDimensions++;
        }
      });

      // Execute the callback if all images have a proper width and height,
      // otherwise we'll show an error message.
      if (hasDimensions == images.length) {
        callback();
      }
      else if (!ManualCrop.loadErrorShown) {
        ManualCrop.loadErrorShown = true;
        alert(Drupal.t('It appears that some of the images could not be loaded for cropping, please try again in another browser.'));
      }
    });
  }
}

Drupal.behaviors.manualcrop = {
  attach: function(context, settings) {
    // Extract the DOM element.
    if (typeof context == 'string') {
      context = $(context);
    }

    if (context instanceof jQuery) {
      context = context.get(0);
    }

    if (context && typeof context == 'object' && typeof context.nodeName != 'undefined') {
      // Only continue if context equals the javascript document object, which is
      // the case on the inital page load, or if context was already added to the
      // document body.
      if (context == document || $.contains(document.body, context)) {
        ManualCrop.init(context);
      }
    }
  }
};

})(jQuery);
;
eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('(m($){18 W=2v.4T,D=2v.4S,F=2v.4R,u=2v.4Q;m V(){C $("<4P/>")};$.N=m(T,c){18 O=$(T),1F,A=V(),1k=V(),I=V().r(V()).r(V()).r(V()),B=V().r(V()).r(V()).r(V()),E=$([]),1K,G,l,17={v:0,l:0},Q,M,1l,1g={v:0,l:0},12=0,1J="1H",2k,2j,1t,1s,S,1B,1A,2o,2n,14,1Q,a,b,j,g,f={a:0,b:0,j:0,g:0,H:0,L:0},2u=R.4O,1M=4N.4M,$p,d,i,o,w,h,2p;m 1n(x){C x+17.v-1g.v};m 1m(y){C y+17.l-1g.l};m 1b(x){C x-17.v+1g.v};m 1a(y){C y-17.l+1g.l};m 1z(3J){C 3J.4L-1g.v};m 1y(3I){C 3I.4K-1g.l};m 13(32){18 1i=32||1t,1h=32||1s;C{a:u(f.a*1i),b:u(f.b*1h),j:u(f.j*1i),g:u(f.g*1h),H:u(f.j*1i)-u(f.a*1i),L:u(f.g*1h)-u(f.b*1h)}};m 23(a,b,j,g,31){18 1i=31||1t,1h=31||1s;f={a:u(a/1i||0),b:u(b/1h||0),j:u(j/1i||0),g:u(g/1h||0)};f.H=f.j-f.a;f.L=f.g-f.b};m 1f(){9(!1F||!O.H()){C}17={v:u(O.2t().v),l:u(O.2t().l)};Q=O.2Y();M=O.3H();17.l+=(O.30()-M)>>1;17.v+=(O.2q()-Q)>>1;1B=u(c.4J/1t)||0;1A=u(c.4I/1s)||0;2o=u(F(c.4H/1t||1<<24,Q));2n=u(F(c.4G/1s||1<<24,M));9($().4F=="1.3.2"&&1J=="21"&&!2u["4E"]){17.l+=D(R.1q.2r,2u.2r);17.v+=D(R.1q.2s,2u.2s)}1g=/1H|4D/.1c(1l.q("1p"))?{v:u(1l.2t().v)-1l.2s(),l:u(1l.2t().l)-1l.2r()}:1J=="21"?{v:$(R).2s(),l:$(R).2r()}:{v:0,l:0};G=1n(0);l=1m(0);9(f.j>Q||f.g>M){1U()}};m 1V(3F){9(!1Q){C}A.q({v:1n(f.a),l:1m(f.b)}).r(1k).H(w=f.H).L(h=f.L);1k.r(I).r(E).q({v:0,l:0});I.H(D(w-I.2q()+I.2Y(),0)).L(D(h-I.30()+I.3H(),0));$(B[0]).q({v:G,l:l,H:f.a,L:M});$(B[1]).q({v:G+f.a,l:l,H:w,L:f.b});$(B[2]).q({v:G+f.j,l:l,H:Q-f.j,L:M});$(B[3]).q({v:G+f.a,l:l+f.g,H:w,L:M-f.g});w-=E.2q();h-=E.30();2O(E.3f){15 8:$(E[4]).q({v:w>>1});$(E[5]).q({v:w,l:h>>1});$(E[6]).q({v:w>>1,l:h});$(E[7]).q({l:h>>1});15 4:E.3G(1,3).q({v:w});E.3G(2,4).q({l:h})}9(3F!==Y){9($.N.2Z!=2R){$(R).U($.N.2z,$.N.2Z)}9(c.1T){$(R)[$.N.2z]($.N.2Z=2R)}}9(1j&&I.2q()-I.2Y()==2){I.q("3E",0);3x(m(){I.q("3E","4C")},0)}};m 22(3D){1f();1V(3D);a=1n(f.a);b=1m(f.b);j=1n(f.j);g=1m(f.g)};m 27(2X,2w){c.1P?2X.4B(c.1P,2w):2X.1r()};m 1d(2W){18 x=1b(1z(2W))-f.a,y=1a(1y(2W))-f.b;9(!2p){1f();2p=11;A.1G("4A",m(){2p=Y})}S="";9(c.2D){9(y<=c.1W){S="n"}X{9(y>=f.L-c.1W){S="s"}}9(x<=c.1W){S+="w"}X{9(x>=f.H-c.1W){S+="e"}}}A.q("2V",S?S+"-19":c.26?"4z":"");9(1K){1K.4y()}};m 2S(4x){$("1q").q("2V","");9(c.4w||f.H*f.L==0){27(A.r(B),m(){$(J).1r()})}$(R).U("P",2l);A.P(1d);c.2f(T,13())};m 2C(1X){9(1X.3z!=1){C Y}1f();9(S){$("1q").q("2V",S+"-19");a=1n(f[/w/.1c(S)?"j":"a"]);b=1m(f[/n/.1c(S)?"g":"b"]);$(R).P(2l).1G("1x",2S);A.U("P",1d)}X{9(c.26){2k=G+f.a-1z(1X);2j=l+f.b-1y(1X);A.U("P",1d);$(R).P(2T).1G("1x",m(){c.2f(T,13());$(R).U("P",2T);A.P(1d)})}X{O.1O(1X)}}C Y};m 1w(3C){9(14){9(3C){j=D(G,F(G+Q,a+W(g-b)*14*(j>a||-1)));g=u(D(l,F(l+M,b+W(j-a)/14*(g>b||-1))));j=u(j)}X{g=D(l,F(l+M,b+W(j-a)/14*(g>b||-1)));j=u(D(G,F(G+Q,a+W(g-b)*14*(j>a||-1))));g=u(g)}}};m 1U(){a=F(a,G+Q);b=F(b,l+M);9(W(j-a)<1B){j=a-1B*(j<a||-1);9(j<G){a=G+1B}X{9(j>G+Q){a=G+Q-1B}}}9(W(g-b)<1A){g=b-1A*(g<b||-1);9(g<l){b=l+1A}X{9(g>l+M){b=l+M-1A}}}j=D(G,F(j,G+Q));g=D(l,F(g,l+M));1w(W(j-a)<W(g-b)*14);9(W(j-a)>2o){j=a-2o*(j<a||-1);1w()}9(W(g-b)>2n){g=b-2n*(g<b||-1);1w(11)}f={a:1b(F(a,j)),j:1b(D(a,j)),b:1a(F(b,g)),g:1a(D(b,g)),H:W(j-a),L:W(g-b)};1V();c.2g(T,13())};m 2l(2U){j=/w|e|^$/.1c(S)||14?1z(2U):1n(f.j);g=/n|s|^$/.1c(S)||14?1y(2U):1m(f.g);1U();C Y};m 1v(3B,3A){j=(a=3B)+f.H;g=(b=3A)+f.L;$.2c(f,{a:1b(a),b:1a(b),j:1b(j),g:1a(g)});1V();c.2g(T,13())};m 2T(2m){a=D(G,F(2k+1z(2m),G+Q-f.H));b=D(l,F(2j+1y(2m),l+M-f.L));1v(a,b);2m.4v();C Y};m 2h(){$(R).U("P",2h);1f();j=a;g=b;1U();S="";9(!B.2y(":4u")){A.r(B).1r().2E(c.1P||0)}1Q=11;$(R).U("1x",1N).P(2l).1G("1x",2S);A.U("P",1d);c.3y(T,13())};m 1N(){$(R).U("P",2h).U("1x",1N);27(A.r(B));23(1b(a),1a(b),1b(a),1a(b));9(!(J 4t $.N)){c.2g(T,13());c.2f(T,13())}};m 2A(2i){9(2i.3z!=1||B.2y(":4s")){C Y}1f();2k=a=1z(2i);2j=b=1y(2i);$(R).P(2h).1x(1N);C Y};m 2B(){22(Y)};m 2x(){1F=11;25(c=$.2c({1S:"4r",26:11,20:"1q",2D:11,1W:10,3w:m(){},3y:m(){},2g:m(){},2f:m(){}},c));A.r(B).q({3b:""});9(c.2F){1Q=11;1f();1V();A.r(B).1r().2E(c.1P||0)}3x(m(){c.3w(T,13())},0)};18 2R=m(16){18 k=c.1T,d,t,2N=16.4q;d=!1L(k.2P)&&(16.2e||16.3t.2e)?k.2P:!1L(k.2a)&&16.3u?k.2a:!1L(k.2b)&&16.3v?k.2b:!1L(k.2Q)?k.2Q:10;9(k.2Q=="19"||(k.2b=="19"&&16.3v)||(k.2a=="19"&&16.3u)||(k.2P=="19"&&(16.2e||16.3t.2e))){2O(2N){15 37:d=-d;15 39:t=D(a,j);a=F(a,j);j=D(t+d,a);1w();1u;15 38:d=-d;15 40:t=D(b,g);b=F(b,g);g=D(t+d,b);1w(11);1u;3s:C}1U()}X{a=F(a,j);b=F(b,g);2O(2N){15 37:1v(D(a-d,G),b);1u;15 38:1v(a,D(b-d,l));1u;15 39:1v(a+F(d,Q-1b(j)),b);1u;15 40:1v(a,b+F(d,M-1a(g)));1u;3s:C}}C Y};m 1R(3r,2M){3p(18 2d 4p 2M){9(c[2d]!==1Y){3r.q(2M[2d],c[2d])}}};m 25(K){9(K.20){(1l=$(K.20)).2G(A.r(B))}$.2c(c,K);1f();9(K.2L!=3q){E.1o();E=$([]);i=K.2L?K.2L=="4o"?4:8:0;3g(i--){E=E.r(V())}E.29(c.1S+"-4n").q({1p:"1H",36:0,1I:12+1||1});9(!4m(E.q("H"))>=0){E.H(5).L(5)}9(o=c.2K){E.q({2K:o,2H:"3m"})}1R(E,{3n:"2J-28",3l:"2I-28",3o:"1e"})}1t=c.4l/Q||1;1s=c.4k/M||1;9(K.a!=3q){23(K.a,K.b,K.j,K.g);K.2F=!K.1r}9(K.1T){c.1T=$.2c({2b:1,2a:"19"},K.1T)}B.29(c.1S+"-4j");1k.29(c.1S+"-4i");3p(i=0;i++<4;){$(I[i-1]).29(c.1S+"-2J"+i)}1R(1k,{4h:"2I-28",4g:"1e"});1R(I,{3o:"1e",2K:"2J-H"});1R(B,{4f:"2I-28",4e:"1e"});9(o=c.3n){$(I[0]).q({2H:"3m",3k:o})}9(o=c.3l){$(I[1]).q({2H:"4d",3k:o})}A.2G(1k.r(I).r(1K)).2G(E);9(1j){9(o=(B.q("3j")||"").3i(/1e=(\\d+)/)){B.q("1e",o[1]/1Z)}9(o=(I.q("3j")||"").3i(/1e=(\\d+)/)){I.q("1e",o[1]/1Z)}}9(K.1r){27(A.r(B))}X{9(K.2F&&1F){1Q=11;A.r(B).2E(c.1P||0);22()}}14=(d=(c.4c||"").4b(/:/))[0]/d[1];O.r(B).U("1O",2A);9(c.1E||c.1D===Y){A.U("P",1d).U("1O",2C);$(3h).U("19",2B)}X{9(c.1D||c.1E===Y){9(c.2D||c.26){A.P(1d).1O(2C)}$(3h).19(2B)}9(!c.4a){O.r(B).1O(2A)}}c.1D=c.1E=1Y};J.1o=m(){25({1E:11});A.r(B).1o()};J.49=m(){C c};J.33=25;J.48=13;J.47=23;J.46=1N;J.45=22;18 1j=(/44 ([\\w.]+)/i.43(1M)||[])[1],3c=/42/i.1c(1M),3d=/41/i.1c(1M)&&!/3Z/i.1c(1M);$p=O;3g($p.3f){12=D(12,!1L($p.q("z-3e"))?$p.q("z-3e"):12);9($p.q("1p")=="21"){1J="21"}$p=$p.20(":3Y(1q)")}12=c.1I||12;9(1j){O.3X("3W","3V")}$.N.2z=1j||3d?"3U":"3T";9(3c){1K=V().q({H:"1Z%",L:"1Z%",1p:"1H",1I:12+2||2})}A.r(B).q({3b:"3a",1p:1J,3S:"3a",1I:12||"0"});A.q({1I:12+2||2});1k.r(I).q({1p:"1H",36:0});T.35||T.3R=="35"||!O.2y("3Q")?2x():O.1G("3P",2x);9(!1F&&1j&&1j>=7){T.34=T.34}};$.2w.N=m(Z){Z=Z||{};J.3O(m(){9($(J).1C("N")){9(Z.1o){$(J).1C("N").1o();$(J).3N("N")}X{$(J).1C("N").33(Z)}}X{9(!Z.1o){9(Z.1D===1Y&&Z.1E===1Y){Z.1D=11}$(J).1C("N",3M $.N(J,Z))}}});9(Z.3L){C $(J).1C("N")}C J}})(3K);',62,304,'|||||||||if|x1|y1|_7|||_23|y2|||x2||top|function||||css|add|||_4|left|||||_a|_d|return|_2|_e|_3|_10|width|_c|this|_55|height|_13|imgAreaSelect|_8|mousemove|_12|document|_1c|_6|unbind|_5|_1|else|false|_58||true|_16|_2c|_21|case|_50|_11|var|resize|_29|_28|test|_3a|opacity|_30|_15|sy|sx|_35|_b|_14|_27|_26|remove|position|body|hide|_1b|_1a|break|_45|_42|mouseup|evY|evX|_1e|_1d|data|enable|disable|_9|one|absolute|zIndex|_17|_f|isNaN|ua|_4a|mousedown|fadeSpeed|_22|_51|classPrefix|keys|_31|_32|resizeMargin|_40|undefined|100|parent|fixed|_36|_2e||_4f|movable|_38|color|addClass|ctrl|shift|extend|_54|altKey|onSelectEnd|onSelectChange|_49|_4c|_19|_18|_3e|_48|_20|_1f|_25|outerWidth|scrollTop|scrollLeft|offset|_24|Math|fn|_4e|is|keyPress|_4b|_4d|_3f|resizable|fadeIn|show|append|borderStyle|background|border|borderWidth|handles|_53|key|switch|alt|arrows|_34|_3c|_41|_44|cursor|_3b|_39|innerWidth|onKeyPress|outerHeight|_2f|_2d|setOptions|src|complete|fontSize||||hidden|visibility|_56|_57|index|length|while|window|match|filter|borderColor|borderColor2|solid|borderColor1|borderOpacity|for|null|_52|default|originalEvent|ctrlKey|shiftKey|onInit|setTimeout|onSelectStart|which|_47|_46|_43|_37|margin|_33|slice|innerHeight|_2b|_2a|jQuery|instance|new|removeData|each|load|img|readyState|overflow|keypress|keydown|on|unselectable|attr|not|chrome||webkit|opera|exec|msie|update|cancelSelection|setSelection|getSelection|getOptions|persistent|split|aspectRatio|dashed|outerOpacity|outerColor|selectionOpacity|selectionColor|selection|outer|imageHeight|imageWidth|parseInt|handle|corners|in|keyCode|imgareaselect|animated|instanceof|visible|preventDefault|autoHide|_3d|toggle|move|mouseout|fadeOut|auto|relative|getBoundingClientRect|jquery|maxHeight|maxWidth|minHeight|minWidth|pageY|pageX|userAgent|navigator|documentElement|div|round|min|max|abs'.split('|')))
;
/*!
 * imagesLoaded PACKAGED v3.1.8
 * JavaScript is all like "You images are done yet or what?"
 * MIT License
 */

(function(){function e(){}function t(e,t){for(var n=e.length;n--;)if(e[n].listener===t)return n;return-1}function n(e){return function(){return this[e].apply(this,arguments)}}var i=e.prototype,r=this,o=r.EventEmitter;i.getListeners=function(e){var t,n,i=this._getEvents();if("object"==typeof e){t={};for(n in i)i.hasOwnProperty(n)&&e.test(n)&&(t[n]=i[n])}else t=i[e]||(i[e]=[]);return t},i.flattenListeners=function(e){var t,n=[];for(t=0;e.length>t;t+=1)n.push(e[t].listener);return n},i.getListenersAsObject=function(e){var t,n=this.getListeners(e);return n instanceof Array&&(t={},t[e]=n),t||n},i.addListener=function(e,n){var i,r=this.getListenersAsObject(e),o="object"==typeof n;for(i in r)r.hasOwnProperty(i)&&-1===t(r[i],n)&&r[i].push(o?n:{listener:n,once:!1});return this},i.on=n("addListener"),i.addOnceListener=function(e,t){return this.addListener(e,{listener:t,once:!0})},i.once=n("addOnceListener"),i.defineEvent=function(e){return this.getListeners(e),this},i.defineEvents=function(e){for(var t=0;e.length>t;t+=1)this.defineEvent(e[t]);return this},i.removeListener=function(e,n){var i,r,o=this.getListenersAsObject(e);for(r in o)o.hasOwnProperty(r)&&(i=t(o[r],n),-1!==i&&o[r].splice(i,1));return this},i.off=n("removeListener"),i.addListeners=function(e,t){return this.manipulateListeners(!1,e,t)},i.removeListeners=function(e,t){return this.manipulateListeners(!0,e,t)},i.manipulateListeners=function(e,t,n){var i,r,o=e?this.removeListener:this.addListener,s=e?this.removeListeners:this.addListeners;if("object"!=typeof t||t instanceof RegExp)for(i=n.length;i--;)o.call(this,t,n[i]);else for(i in t)t.hasOwnProperty(i)&&(r=t[i])&&("function"==typeof r?o.call(this,i,r):s.call(this,i,r));return this},i.removeEvent=function(e){var t,n=typeof e,i=this._getEvents();if("string"===n)delete i[e];else if("object"===n)for(t in i)i.hasOwnProperty(t)&&e.test(t)&&delete i[t];else delete this._events;return this},i.removeAllListeners=n("removeEvent"),i.emitEvent=function(e,t){var n,i,r,o,s=this.getListenersAsObject(e);for(r in s)if(s.hasOwnProperty(r))for(i=s[r].length;i--;)n=s[r][i],n.once===!0&&this.removeListener(e,n.listener),o=n.listener.apply(this,t||[]),o===this._getOnceReturnValue()&&this.removeListener(e,n.listener);return this},i.trigger=n("emitEvent"),i.emit=function(e){var t=Array.prototype.slice.call(arguments,1);return this.emitEvent(e,t)},i.setOnceReturnValue=function(e){return this._onceReturnValue=e,this},i._getOnceReturnValue=function(){return this.hasOwnProperty("_onceReturnValue")?this._onceReturnValue:!0},i._getEvents=function(){return this._events||(this._events={})},e.noConflict=function(){return r.EventEmitter=o,e},"function"==typeof define&&define.amd?define("eventEmitter/EventEmitter",[],function(){return e}):"object"==typeof module&&module.exports?module.exports=e:this.EventEmitter=e}).call(this),function(e){function t(t){var n=e.event;return n.target=n.target||n.srcElement||t,n}var n=document.documentElement,i=function(){};n.addEventListener?i=function(e,t,n){e.addEventListener(t,n,!1)}:n.attachEvent&&(i=function(e,n,i){e[n+i]=i.handleEvent?function(){var n=t(e);i.handleEvent.call(i,n)}:function(){var n=t(e);i.call(e,n)},e.attachEvent("on"+n,e[n+i])});var r=function(){};n.removeEventListener?r=function(e,t,n){e.removeEventListener(t,n,!1)}:n.detachEvent&&(r=function(e,t,n){e.detachEvent("on"+t,e[t+n]);try{delete e[t+n]}catch(i){e[t+n]=void 0}});var o={bind:i,unbind:r};"function"==typeof define&&define.amd?define("eventie/eventie",o):e.eventie=o}(this),function(e,t){"function"==typeof define&&define.amd?define(["eventEmitter/EventEmitter","eventie/eventie"],function(n,i){return t(e,n,i)}):"object"==typeof exports?module.exports=t(e,require("wolfy87-eventemitter"),require("eventie")):e.imagesLoaded=t(e,e.EventEmitter,e.eventie)}(window,function(e,t,n){function i(e,t){for(var n in t)e[n]=t[n];return e}function r(e){return"[object Array]"===d.call(e)}function o(e){var t=[];if(r(e))t=e;else if("number"==typeof e.length)for(var n=0,i=e.length;i>n;n++)t.push(e[n]);else t.push(e);return t}function s(e,t,n){if(!(this instanceof s))return new s(e,t);"string"==typeof e&&(e=document.querySelectorAll(e)),this.elements=o(e),this.options=i({},this.options),"function"==typeof t?n=t:i(this.options,t),n&&this.on("always",n),this.getImages(),a&&(this.jqDeferred=new a.Deferred);var r=this;setTimeout(function(){r.check()})}function f(e){this.img=e}function c(e){this.src=e,v[e]=this}var a=e.jQuery,u=e.console,h=u!==void 0,d=Object.prototype.toString;s.prototype=new t,s.prototype.options={},s.prototype.getImages=function(){this.images=[];for(var e=0,t=this.elements.length;t>e;e++){var n=this.elements[e];"IMG"===n.nodeName&&this.addImage(n);var i=n.nodeType;if(i&&(1===i||9===i||11===i))for(var r=n.querySelectorAll("img"),o=0,s=r.length;s>o;o++){var f=r[o];this.addImage(f)}}},s.prototype.addImage=function(e){var t=new f(e);this.images.push(t)},s.prototype.check=function(){function e(e,r){return t.options.debug&&h&&u.log("confirm",e,r),t.progress(e),n++,n===i&&t.complete(),!0}var t=this,n=0,i=this.images.length;if(this.hasAnyBroken=!1,!i)return this.complete(),void 0;for(var r=0;i>r;r++){var o=this.images[r];o.on("confirm",e),o.check()}},s.prototype.progress=function(e){this.hasAnyBroken=this.hasAnyBroken||!e.isLoaded;var t=this;setTimeout(function(){t.emit("progress",t,e),t.jqDeferred&&t.jqDeferred.notify&&t.jqDeferred.notify(t,e)})},s.prototype.complete=function(){var e=this.hasAnyBroken?"fail":"done";this.isComplete=!0;var t=this;setTimeout(function(){if(t.emit(e,t),t.emit("always",t),t.jqDeferred){var n=t.hasAnyBroken?"reject":"resolve";t.jqDeferred[n](t)}})},a&&(a.fn.imagesLoaded=function(e,t){var n=new s(this,e,t);return n.jqDeferred.promise(a(this))}),f.prototype=new t,f.prototype.check=function(){var e=v[this.img.src]||new c(this.img.src);if(e.isConfirmed)return this.confirm(e.isLoaded,"cached was confirmed"),void 0;if(this.img.complete&&void 0!==this.img.naturalWidth)return this.confirm(0!==this.img.naturalWidth,"naturalWidth"),void 0;var t=this;e.on("confirm",function(e,n){return t.confirm(e.isLoaded,n),!0}),e.check()},f.prototype.confirm=function(e,t){this.isLoaded=e,this.emit("confirm",this,t)};var v={};return c.prototype=new t,c.prototype.check=function(){if(!this.isChecked){var e=new Image;n.bind(e,"load",this),n.bind(e,"error",this),e.src=this.src,this.isChecked=!0}},c.prototype.handleEvent=function(e){var t="on"+e.type;this[t]&&this[t](e)},c.prototype.onload=function(e){this.confirm(!0,"onload"),this.unbindProxyEvents(e)},c.prototype.onerror=function(e){this.confirm(!1,"onerror"),this.unbindProxyEvents(e)},c.prototype.confirm=function(e,t){this.isConfirmed=!0,this.isLoaded=e,this.emit("confirm",this,t)},c.prototype.unbindProxyEvents=function(e){n.unbind(e.target,"load",this),n.unbind(e.target,"error",this)},s});;
(function ($) {

/**
 * Attaches sticky table headers.
 */
Drupal.behaviors.tableHeader = {
  attach: function (context, settings) {
    if (!$.support.positionFixed) {
      return;
    }

    $('table.sticky-enabled', context).once('tableheader', function () {
      $(this).data("drupal-tableheader", new Drupal.tableHeader(this));
    });
  }
};

/**
 * Constructor for the tableHeader object. Provides sticky table headers.
 *
 * @param table
 *   DOM object for the table to add a sticky header to.
 */
Drupal.tableHeader = function (table) {
  var self = this;

  this.originalTable = $(table);
  this.originalHeader = $(table).children('thead');
  this.originalHeaderCells = this.originalHeader.find('> tr > th');
  this.displayWeight = null;

  // React to columns change to avoid making checks in the scroll callback.
  this.originalTable.bind('columnschange', function (e, display) {
    // This will force header size to be calculated on scroll.
    self.widthCalculated = (self.displayWeight !== null && self.displayWeight === display);
    self.displayWeight = display;
  });

  // Clone the table header so it inherits original jQuery properties. Hide
  // the table to avoid a flash of the header clone upon page load.
  this.stickyTable = $('<table class="sticky-header"/>')
    .insertBefore(this.originalTable)
    .css({ position: 'fixed', top: '0px' });
  this.stickyHeader = this.originalHeader.clone(true)
    .hide()
    .appendTo(this.stickyTable);
  this.stickyHeaderCells = this.stickyHeader.find('> tr > th');

  this.originalTable.addClass('sticky-table');
  $(window)
    .bind('scroll.drupal-tableheader', $.proxy(this, 'eventhandlerRecalculateStickyHeader'))
    .bind('resize.drupal-tableheader', { calculateWidth: true }, $.proxy(this, 'eventhandlerRecalculateStickyHeader'))
    // Make sure the anchor being scrolled into view is not hidden beneath the
    // sticky table header. Adjust the scrollTop if it does.
    .bind('drupalDisplaceAnchor.drupal-tableheader', function () {
      window.scrollBy(0, -self.stickyTable.outerHeight());
    })
    // Make sure the element being focused is not hidden beneath the sticky
    // table header. Adjust the scrollTop if it does.
    .bind('drupalDisplaceFocus.drupal-tableheader', function (event) {
      if (self.stickyVisible && event.clientY < (self.stickyOffsetTop + self.stickyTable.outerHeight()) && event.$target.closest('sticky-header').length === 0) {
        window.scrollBy(0, -self.stickyTable.outerHeight());
      }
    })
    .triggerHandler('resize.drupal-tableheader');

  // We hid the header to avoid it showing up erroneously on page load;
  // we need to unhide it now so that it will show up when expected.
  this.stickyHeader.show();
};

/**
 * Event handler: recalculates position of the sticky table header.
 *
 * @param event
 *   Event being triggered.
 */
Drupal.tableHeader.prototype.eventhandlerRecalculateStickyHeader = function (event) {
  var self = this;
  var calculateWidth = event.data && event.data.calculateWidth;

  // Reset top position of sticky table headers to the current top offset.
  this.stickyOffsetTop = Drupal.settings.tableHeaderOffset ? eval(Drupal.settings.tableHeaderOffset + '()') : 0;
  this.stickyTable.css('top', this.stickyOffsetTop + 'px');

  // Save positioning data.
  var viewHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
  if (calculateWidth || this.viewHeight !== viewHeight) {
    this.viewHeight = viewHeight;
    this.vPosition = this.originalTable.offset().top - 4 - this.stickyOffsetTop;
    this.hPosition = this.originalTable.offset().left;
    this.vLength = this.originalTable[0].clientHeight - 100;
    calculateWidth = true;
  }

  // Track horizontal positioning relative to the viewport and set visibility.
  var hScroll = document.documentElement.scrollLeft || document.body.scrollLeft;
  var vOffset = (document.documentElement.scrollTop || document.body.scrollTop) - this.vPosition;
  this.stickyVisible = vOffset > 0 && vOffset < this.vLength;
  this.stickyTable.css({ left: (-hScroll + this.hPosition) + 'px', visibility: this.stickyVisible ? 'visible' : 'hidden' });

  // Only perform expensive calculations if the sticky header is actually
  // visible or when forced.
  if (this.stickyVisible && (calculateWidth || !this.widthCalculated)) {
    this.widthCalculated = true;
    var $that = null;
    var $stickyCell = null;
    var display = null;
    var cellWidth = null;
    // Resize header and its cell widths.
    // Only apply width to visible table cells. This prevents the header from
    // displaying incorrectly when the sticky header is no longer visible.
    for (var i = 0, il = this.originalHeaderCells.length; i < il; i += 1) {
      $that = $(this.originalHeaderCells[i]);
      $stickyCell = this.stickyHeaderCells.eq($that.index());
      display = $that.css('display');
      if (display !== 'none') {
        cellWidth = $that.css('width');
        // Exception for IE7.
        if (cellWidth === 'auto') {
          cellWidth = $that[0].clientWidth + 'px';
        }
        $stickyCell.css({'width': cellWidth, 'display': display});
      }
      else {
        $stickyCell.css('display', 'none');
      }
    }
    this.stickyTable.css('width', this.originalTable.outerWidth());
  }
};

})(jQuery);
;
