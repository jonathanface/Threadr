
import React from 'react';

export const TabSpan = (props) => {
  return (
    <span className="tabEntity">{props.children}</span>
  );
};

export const HighlightSpan = (props) => {
  return (
    <span onClick={(e)=> {
      props.leftClickFunc(props.association, e);
    }} onContextMenu={(e)=> {
      props.rightClickFunc(props.decoratedText, props.association.association_type, e);
    }} className={'highlight ' + props.association.association_type }>
      {props.children}
    </span>
  );
};

const getRegexString = (string) => {
  return '\\b' + string + '\\b';
};

/**
 * Find entities of type character in block
 *
 * @param {ContentBlock} contentBlock
 * @param {function} callback
 * @param {ContentState} contentState
 */
export const FindHighlightable = (entityType, associations) => {
  return (contentBlock, callback) => {
    const text = contentBlock.getText();
    associations.forEach((association) => {
      if (association.association_type !== entityType) {
        return;
      }
      const name = association.association_name.trim();
      if (!name.length) {
        return;
      }
      let match;
      const regexStr = getRegexString(name);
      let caseFlag = 'gm';
      const deets = association.details;
      if (!deets.caseSensitive) {
        caseFlag += 'i';
      }
      const regex = new RegExp(regexStr, caseFlag);
      while ((match = regex.exec(text)) !== null) {
        const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
        callback(start, start + name.length);
      }
      const aliasesToArray = deets.aliases.split(',');
      for (let z=0; z < aliasesToArray.length; z++) {
        const alias = aliasesToArray[z].trim();
        if (alias.length) {
          const regexStr = getRegexString(alias);
          const regex = new RegExp(regexStr, caseFlag);
          while ((match = regex.exec(text)) !== null) {
            const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
            callback(start, start + alias.length);
          }
        }
      }
    });
  };
};

export const FindTabs = (contentBlock, callback, contentState) => {
  contentBlock.findEntityRanges((character) => {
    const entityKey = character.getEntity();
    return (
      entityKey !== null && contentState.getEntity(entityKey).getType() === 'TAB'
    );
  },
  callback);
};
