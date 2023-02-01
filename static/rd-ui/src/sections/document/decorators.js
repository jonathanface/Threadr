import {CompositeDecorator} from 'draft-js';
import React from 'react';



const TabSpan = (props) => { 
    return (
      <span className="tabEntity">{props.children}</span>
    );
  };

const HighlightSpan = (props) => {
    return (
      <span onClick={(e)=> {props.leftclickFunc(props.decoratedText, props.type);}} className={"highlight " + props.type }>
        {props.children}
      </span>
    );
  };
  
  const getRegexString = (string) => {
    return '\\b' + string + '\\b';
  }
  
  /**
     * Find entities of type character in block
     *
     * @param {ContentBlock} contentBlock
     * @param {function} callback
     * @param {ContentState} contentState
     */
  const findHighlightable = (entityType, associations) => {
    return (contentBlock, callback) => {
      const text = contentBlock.getText();
      associations.forEach((association) => {
        if (association.type !== entityType) {
          return;
        }
        console.log("looking for", association.type)
        const name = association.name.trim();
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
    }
  }
  
  const clickedDecorator = (name, type) => {
    console.log('clicked', name, type);
  }
  
  export const CreateDecorators = (associations) => {
    const decorators = [];
    associations.forEach((association) => {
      decorators.push({
        strategy: findHighlightable(association.type, associations),
        component: HighlightSpan,
        props: {
          type: association.type,
          leftclickFunc: clickedDecorator
          // rightclickFunc: this.clickedCharacterContext.bind(this)
        }
      });
    });
    decorators.push({
      strategy: findTabs,
      component: TabSpan
    });
    return new CompositeDecorator(decorators);
  }
  
  const findTabs = (contentBlock, callback, contentState) => {
    contentBlock.findEntityRanges((character) => {
      const entityKey = character.getEntity();
      return (
        entityKey !== null &&
        contentState.getEntity(entityKey).getType() === 'TAB'
      );
    },
    callback);
  }
