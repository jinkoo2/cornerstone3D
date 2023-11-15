import { AnnotationDisplayTool } from '../base';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import {
  VolumeViewport,
  utilities as csUtils,
  getRenderingEngines,
  Types,
  StackViewport,
} from '@cornerstonejs/core';

import { addAnnotation, getAnnotations } from '../../stateManagement';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';

import toolStyle from '../../stateManagement/annotation/config/ToolStyle';

import { drawRect as drawRectSvg } from '../../drawingSvg';

import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import {
  ToolProps,
  PublicToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../types';

import { StyleSpecifier } from '../../types/AnnotationStyle';

/**
 * CubeROIDisplayAnnotation let you draw cube annotations
 *
 * ```js
 * cornerstoneTools.addTool(CubeROIDisplayTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(CubeROIDisplayTool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolEnabled(CubeROIDisplayTool.toolName)
 *
 * ```
 *
 * Read more in the Docs section of the website.
 */
class CubeROIDisplayTool extends AnnotationDisplayTool {
  static toolName;

  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
  } | null;
  isDrawing: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _isAxialVolumeViewport(viewport: any) {
    return (
      viewport instanceof VolumeViewport &&
      viewport.type === 'orthographic' &&
      viewport.options.orientation === 'axial'
    );
  }
  _isCoronalVolumeViewport(viewport: any) {
    return (
      viewport instanceof VolumeViewport &&
      viewport.type === 'orthographic' &&
      viewport.options.orientation === 'coronal'
    );
  }
  _isSagittalVolumeViewport(viewport: any) {
    return (
      viewport instanceof VolumeViewport &&
      viewport.type === 'orthographic' &&
      viewport.options.orientation === 'sagittal'
    );
  }

  _throw(msg: string) {
    throw new Error(msg);
  }
  _getFirstRenderEngine(): Types.IRenderingEngine {
    const renderingEngines = getRenderingEngines();
    if (!renderingEngines || renderingEngines?.length === 0) {
      this._throw('No render engine found!');
    }

    // first render engine
    const renderingEngine: Types.IRenderingEngine = renderingEngines[0];

    // Todo: handle this case where it is too soon to get the rendering engine
    if (!renderingEngine) {
      this._throw('Invalid render engin');
    }

    return renderingEngine;
  }

  _getFirstViewport(): Types.IViewport {
    const renderingEngine: Types.IRenderingEngine =
      this._getFirstRenderEngine();

    const viewports: Array<Types.IViewport> = renderingEngine.getViewports();

    if (viewports?.length === 0) {
      this._throw('RenderEngine has no view ports yet!');
    }

    // first viewport
    const viewport = viewports[0];

    if (!viewport) {
      this._throw('No viewport defined yet!');
    }

    return viewport;
  }

  _getImageData() {
    const viewport = this._getFirstViewport();

    if (viewport instanceof VolumeViewport) {
      const vv: VolumeViewport = viewport as VolumeViewport;

      const image: Types.IImageData = vv.getImageData();
      if (!image) {
        this._throw('Viewport has no associated image yet!');
      }

      return image;
    } else if (viewport instanceof StackViewport) {
      const sv: StackViewport = viewport as StackViewport;

      const image: any = sv.getImageData();

      if (!image) {
        this._throw('Viewport has no associated image yet!');
      }

      return image;
    } else {
      this._throw(
        'Unknown viewport type! Only VolumeViewport and StackViewport are supported.'
      );
    }
  }

  _getVtkImageData(): vtkImageData {
    const image: any = this._getImageData();
    const vtkImage = image.imageData as vtkImageData;

    if (!vtkImage) {
      this._throw('Invalid vtkImageData');
    }

    return vtkImage;
  }

  addAnnotationInImageIndex(
    low_index: Types.Point3,
    high_index: Types.Point3,
    color?: string
  ): Annotation {
    console.log('=== addAnnotationInImageIndex() === ');

    const vtkImage: vtkImageData = this._getVtkImageData();
    const low_w = vtkImage.indexToWorld(low_index);
    const high_w = vtkImage.indexToWorld(high_index);

    return this.addAnnotationInWorldCoordinate(
      low_w as Types.Point3,
      high_w as Types.Point3,
      color
    );
  }

  addAnnotationInWorldCoordinate(
    low_w: Types.Point3,
    high_w: Types.Point3,
    color?: string
  ): Annotation {
    //console.log('=== addAnnotationInWorldCoordinate() === ')

    const renderingEngine = this._getFirstRenderEngine();
    const viewport = this._getFirstViewport();

    this.isDrawing = true;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      low_w as Types.Point3,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        label: '',
        handles: {
          // point1: (xl, yl, zl) in world coorindate
          // point2: (xh, yh, zh) in world coordinate
          points: [low_w, high_w],
          activeHandleIndex: null,
        },
      },
    };

    const annotationUID = addAnnotation(annotation, viewport.element);

    if (color) {
      // set the color at the annotation level (most specific, see stateManagement/annotation/config/ToolStyle.ts)
      toolStyle.setAnnotationStyles(annotationUID, { color: color });
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      viewport.element,
      this.getToolName(),
      false
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
    };

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  }

  addAnnotationInImagePhysicalCoordiate(
    low_image_org: Types.Point3,
    high_image_org: Types.Point3,
    color?: string
  ) {
    console.log('=== addAnnotationInImagePhysicalCoordiate() === ');

    // convert to image index
    const { spacing } = this._getImageData();

    const low_index: Types.Point3 = [
      low_image_org[0] / spacing[0],
      low_image_org[1] / spacing[1],
      low_image_org[2] / spacing[2],
    ];
    const high_index: Types.Point3 = [
      high_image_org[0] / spacing[0],
      high_image_org[1] / spacing[1],
      high_image_org[2] / spacing[2],
    ];

    return this.addAnnotationInImageIndex(low_index, high_index, color);
  }

  /**
   * it is used to draw the rectangleROI annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    //console.log('enabledElement=', enabledElement)
    //console.log('svgDrawingHelper=', svgDrawingHelper)

    let renderStatus = false;

    const { viewport } = enabledElement;
    const { element } = viewport;

    const annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    console.log('===> renderAnnotation(***) <===');

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const viewportCanvasCornersInWorld =
      csUtils.getViewportImageCornersInWorld(viewport);

    //console.log('viewportCanvasCornersInWorld=', viewportCanvasCornersInWorld)

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as Annotation;
      const { annotationUID, data } = annotation;
      const { points: points_w, activeHandleIndex } = data.handles;

      const [low_w, high_w] = points_w;
      const xl = low_w[0];
      const yl = low_w[1];
      const zl = low_w[2];
      const xh = high_w[0];
      const yh = high_w[1];
      const zh = high_w[2];

      // project to 8 points
      const eightPoints_w = [
        [xl, yl, zl],
        [xh, yl, zl],
        [xl, yh, zl],
        [xh, yh, zl],

        [xl, yl, zh],
        [xh, yl, zh],
        [xl, yh, zh],
        [xh, yh, zh],
      ] as Types.Point3[];

      // convert from index to world
      const canvasCoordinates = eightPoints_w.map((p) =>
        viewport.worldToCanvas(p as Types.Point3)
      );

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      let color = this.getStyle('color', styleSpecifier, annotation);

      // somehow getStyle(color), does not give the color, set during the addAnnotationXXX() function.
      // so using toolStyle
      const style = toolStyle.getAnnotationToolStyles(annotationUID);
      if (style && style.color) {
        color = style.color;
      }

      // dash style when out of range
      const lineDashOutOfRange = '3,3';

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      const dataId = `${annotationUID}-rect`;

      if (this._isAxialVolumeViewport(viewport)) {
        //console.log('this is axial volume viewport!')

        const slice_z = viewportCanvasCornersInWorld[0][2];
        //console.log('slice_z=', slice_z)

        const rectangleUID = '0';
        if (slice_z >= zl && slice_z <= zh) {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[0],
            canvasCoordinates[3],
            {
              color,
              lineDash,
              lineWidth,
            },
            dataId
          );
        } else {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[0],
            canvasCoordinates[3],
            {
              color,
              lineDash: lineDashOutOfRange,
              lineWidth,
            },
            dataId
          );

          console.log('slice_z is not intersecting with the cube');
        }
      } else if (this._isCoronalVolumeViewport(viewport)) {
        //console.log('this is Coronal volume viewport!')

        const slice_y = viewportCanvasCornersInWorld[0][1];
        //console.log('slice_y=', slice_y)

        const rectangleUID = '1';

        if (slice_y >= yl && slice_y <= yh) {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[4],
            canvasCoordinates[1],
            {
              color,
              lineDash,
              lineWidth,
            },
            dataId
          );
        } else {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[4],
            canvasCoordinates[1],
            {
              color,
              lineDash: lineDashOutOfRange,
              lineWidth,
            },
            dataId
          );

          console.log('slice_y is not intersecting with the cube');
        }
      } else if (this._isSagittalVolumeViewport(viewport)) {
        //console.log('this is Sagittal volume viewport!')

        const slice_x = viewportCanvasCornersInWorld[0][0];
        //console.log('slice_x=', slice_x)

        const rectangleUID = '2';

        if (slice_x >= xl && slice_x <= xh) {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[5],
            canvasCoordinates[3],
            {
              color,
              lineDash,
              lineWidth,
            },
            dataId
          );
        } else {
          drawRectSvg(
            svgDrawingHelper,
            annotationUID,
            rectangleUID,
            canvasCoordinates[5],
            canvasCoordinates[3],
            {
              color,
              lineDash: lineDashOutOfRange,
              lineWidth,
            },
            dataId
          );

          //console.log('slice_x is not intersecting with the cube')
        }
      } else {
        console.log('Only Axial/Coronal/Sagital Volume viewport is supported!');
        return false;
      }

      renderStatus = true;
    } // for annotations

    return renderStatus;
  };

  _getRectangleImageCoordinates = (
    points: Array<Types.Point2>
  ): {
    left: number;
    top: number;
    width: number;
    height: number;
  } => {
    const [point0, point1] = points;

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    };
  };

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  };
}

CubeROIDisplayTool.toolName = 'CubeROIDisplay';
export default CubeROIDisplayTool;
